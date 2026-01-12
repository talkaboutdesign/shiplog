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
    const supportedEvents = ["push", "pull_request", "pull_request_review", "issues"];
    if (!supportedEvents.includes(eventType)) {
      return new Response("Event type not supported", { status: 200 });
    }

    try {
      // Find repository by installation ID
      const installationId = payload.installation?.id;
      if (!installationId) {
        return new Response("Missing installation ID", { status: 400 });
      }

      const repository = await ctx.runQuery(api.repositories.getByInstallation, {
        installationId,
      });

      if (!repository) {
        console.error(`Repository not found for installation ${installationId}`);
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
      } else if (eventType === "pull_request" || eventType === "pull_request_review") {
        actorGithubUsername = payload.sender?.login || payload.review?.user?.login || "unknown";
        actorGithubId = payload.sender?.id || payload.review?.user?.id || 0;
        actorAvatarUrl = payload.sender?.avatar_url || payload.review?.user?.avatar_url;
      } else if (eventType === "issues") {
        actorGithubUsername = payload.sender?.login || payload.issue?.user?.login || "unknown";
        actorGithubId = payload.sender?.id || payload.issue?.user?.id || 0;
        actorAvatarUrl = payload.sender?.avatar_url || payload.issue?.user?.avatar_url;
      }

      // Determine occurredAt timestamp
      let occurredAt = Date.now();
      if (payload.repository?.updated_at) {
        occurredAt = new Date(payload.repository.updated_at).getTime();
      } else if (payload.pull_request?.updated_at) {
        occurredAt = new Date(payload.pull_request.updated_at).getTime();
      } else if (payload.issue?.updated_at) {
        occurredAt = new Date(payload.issue.updated_at).getTime();
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
