import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { internal } from "./_generated/api";

const http = httpRouter();

async function verifySignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  // Use Web Crypto API for HMAC verification
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const payloadData = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    payloadData
  );

  const calculatedDigest = "sha256=" + Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Timing-safe comparison
  if (signature.length !== calculatedDigest.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ calculatedDigest.charCodeAt(i);
  }

  return result === 0;
}

http.route({
  path: "/github/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    console.log("GitHub callback received at backend");
    const url = new URL(request.url);
    const installationId = url.searchParams.get("installation_id");
    const setupAction = url.searchParams.get("setup_action");
    
    console.log("Backend callback - installation_id:", installationId);
    console.log("Backend callback - setup_action:", setupAction);
    console.log("Backend callback - full URL:", url.toString());

    if (!installationId) {
      console.error("Backend callback - Missing installation_id");
      return new Response("Missing installation_id", { status: 400 });
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    try {
      // Get the authenticated user from Clerk token
      const identity = await ctx.auth.getUserIdentity();
      console.log("Backend callback - User identity:", identity ? "present" : "missing");
      if (!identity) {
        console.error("Backend callback - Unauthorized (no identity)");
        return new Response(
          `Unauthorized. Please <a href="${frontendUrl}">sign in</a> first.`,
          {
            status: 401,
            headers: { "Content-Type": "text/html" },
          }
        );
      }

      // Find user by Clerk ID
      const user = await ctx.runQuery(api.users.getCurrent);
      if (!user) {
        return new Response("User not found. Please sign in again.", {
          status: 404,
        });
      }

      // Store repository
      await ctx.runAction(internal.githubActions.syncInstallation, {
        userId: user._id,
        installationId: parseInt(installationId, 10),
      });

      // Redirect back to dashboard
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${frontendUrl}`,
        },
      });
    } catch (error) {
      console.error("Error processing GitHub callback:", error);
      return new Response(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        { status: 500 }
      );
    }
  }),
});

http.route({
  path: "/github/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    console.log("Webhook handler called - /github/webhook");
    const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("GITHUB_WEBHOOK_SECRET not configured");
      return new Response("Webhook secret not configured", { status: 500 });
    }

    const eventType = request.headers.get("X-GitHub-Event");
    const deliveryId = request.headers.get("X-GitHub-Delivery");
    const signature = request.headers.get("X-Hub-Signature-256");

    if (!eventType || !deliveryId || !signature) {
      return new Response("Missing required headers", { status: 400 });
    }

    const body = await request.text();

    // Verify signature
    const isValid = await verifySignature(body, signature, webhookSecret);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response("Invalid signature", { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Only process events we care about
    const supportedEvents = ["push", "pull_request"];
    if (!supportedEvents.includes(eventType)) {
      return new Response("Event type not supported", { status: 200 });
    }

    try {
      // Get repository information from payload
      const repositoryPayload = payload.repository;
      if (!repositoryPayload || !repositoryPayload.id) {
        return new Response("Missing repository information in payload", { status: 400 });
      }

      const githubRepoId = repositoryPayload.id;
      const installationId = payload.installation?.id;
      
      if (!installationId) {
        return new Response("Missing installation ID", { status: 400 });
      }

      // Find repository by GitHub repository ID (more accurate than installation ID)
      // This ensures we match the exact repository the event came from
      let repository = await ctx.runQuery(internal.repositories.getByGithubId, {
        githubId: githubRepoId,
      });

      // Fallback: if repository not found by GitHub ID, try by installation ID
      // This handles edge cases where repo might not be synced yet
      if (!repository) {
        console.warn(`Repository with GitHub ID ${githubRepoId} not found, trying installation ID ${installationId}`);
        repository = await ctx.runQuery(internal.repositories.getByInstallationInternal, {
          installationId,
        });
      }

      if (!repository) {
        console.error(`Repository not found for GitHub ID ${githubRepoId} or installation ${installationId}`);
        return new Response("Repository not found", { status: 404 });
      }

      // Extract actor info
      let actorGithubUsername = "";
      let actorGithubId = 0;
      let actorAvatarUrl: string | undefined;

      if (eventType === "push") {
        actorGithubUsername = payload.pusher?.name || payload.sender?.login || "unknown";
        actorGithubId = payload.sender?.id || 0;
        actorAvatarUrl = payload.sender?.avatar_url;
      } else if (eventType === "pull_request") {
        actorGithubUsername = payload.sender?.login || "unknown";
        actorGithubId = payload.sender?.id || 0;
        actorAvatarUrl = payload.sender?.avatar_url;
      }

      // Determine occurredAt timestamp
      let occurredAt = Date.now();
      if (eventType === "push") {
        // For push events, use the head commit timestamp or first commit timestamp
        if (payload.head_commit?.timestamp) {
          occurredAt = new Date(payload.head_commit.timestamp).getTime();
        } else if (payload.commits?.[0]?.timestamp) {
          occurredAt = new Date(payload.commits[0].timestamp).getTime();
        } else {
          // Fallback to current time if no commit timestamp available
          occurredAt = Date.now();
        }
      } else if (eventType === "pull_request") {
        // For PR events, use the PR updated_at or created_at
        if (payload.pull_request?.updated_at) {
          occurredAt = new Date(payload.pull_request.updated_at).getTime();
        } else if (payload.pull_request?.created_at) {
          occurredAt = new Date(payload.pull_request.created_at).getTime();
        }
      }

      // Store event
      await ctx.runMutation(internal.events.create, {
        repositoryId: repository._id,
        githubDeliveryId: deliveryId,
        type: eventType,
        action: payload.action,
        payload,
        actorGithubUsername,
        actorGithubId,
        actorAvatarUrl,
        occurredAt,
      });

      return new Response("Event processed", { status: 200 });
    } catch (error) {
      console.error("Error processing webhook:", error);
      return new Response(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        { status: 500 }
      );
    }
  }),
});

export default http;
