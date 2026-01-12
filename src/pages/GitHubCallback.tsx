import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppShell } from "@/components/layout/AppShell";

export function GitHubCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const syncInstallation = useAction(api.repositories.syncInstallationFromCallback);

  useEffect(() => {
    console.log("GitHubCallback: Component mounted");
    console.log("GitHubCallback: Full URL:", window.location.href);
    
    const urlParams = new URLSearchParams(window.location.search);
    const installationId = urlParams.get("installation_id");
    const setupAction = urlParams.get("setup_action");
    
    console.log("GitHubCallback: installation_id:", installationId);
    console.log("GitHubCallback: setup_action:", setupAction);
    console.log("GitHubCallback: All URL params:", Object.fromEntries(urlParams.entries()));
    
    if (!installationId) {
      console.error("GitHubCallback: Missing installation_id parameter");
      setStatus("error");
      setErrorMessage("Missing installation_id parameter");
      return;
    }

    const handleCallback = async () => {
      try {
        console.log("GitHubCallback: Starting syncInstallation with installationId:", installationId);
        await syncInstallation({
          installationId: parseInt(installationId, 10),
        });
        console.log("GitHubCallback: syncInstallation succeeded");
        setStatus("success");
        setTimeout(() => {
          window.location.href = "/";
        }, 1500);
      } catch (error) {
        console.error("GitHubCallback: Error syncing installation:", error);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to connect repository"
        );
      }
    };

    void handleCallback();
  }, [syncInstallation]);

  return (
    <AppShell>
      <div className="container mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>
              {status === "loading" && "Connecting repository..."}
              {status === "success" && "Repository connected!"}
              {status === "error" && "Connection failed"}
            </CardTitle>
            <CardDescription>
              {status === "loading" &&
                "Please wait while we set up your repository connection."}
              {status === "success" &&
                "Your repository has been successfully connected."}
              {status === "error" && errorMessage}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {status === "loading" && (
              <p className="text-muted-foreground">
                This should only take a moment...
              </p>
            )}
            {status === "success" && (
              <p className="text-muted-foreground">
                Redirecting you to the dashboard...
              </p>
            )}
            {status === "error" && (
              <div className="space-y-4">
                <p className="text-sm text-destructive">{errorMessage}</p>
                <button
                  onClick={() => (window.location.href = "/")}
                  className="text-sm text-primary hover:underline"
                >
                  Go to Dashboard
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
