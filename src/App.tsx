"use client";

import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton } from "@clerk/clerk-react";
import { Summary } from "./pages/Summary";
import { Feed } from "./pages/Feed";
import { GitHubCallback } from "./pages/GitHubCallback";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { SelectedRepoProvider } from "./hooks/useSelectedRepo";

export default function App() {
  // Check route
  const path = window.location.pathname;
  const isCallback = path === "/github/callback";
  const isFeed = path === "/feed";

  return (
    <>
      <Authenticated>
        <SelectedRepoProvider>
          {isCallback ? (
            <GitHubCallback />
          ) : isFeed ? (
            <FeedWrapper />
          ) : (
            <SummaryWrapper />
          )}
        </SelectedRepoProvider>
      </Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
    </>
  );
}

function SummaryWrapper() {
  useCurrentUser();
  return <Summary />;
}

function FeedWrapper() {
  useCurrentUser();
  return <Feed />;
}

function SignInForm() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col gap-8 w-96">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-2">ShipLog</h1>
          <p className="text-muted-foreground">
            AI-powered GitHub activity feed
          </p>
        </div>
        <SignInButton mode="modal">
          <button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium">
            Sign in with GitHub
          </button>
        </SignInButton>
      </div>
    </div>
  );
}

