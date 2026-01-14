"use client";

import { Routes, Route } from "react-router-dom";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton } from "@clerk/clerk-react";
import { ActivityTimeline } from "./pages/ActivityTimeline";
import { GitHubCallback } from "./pages/GitHubCallback";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { SelectedRepoProvider } from "./hooks/useSelectedRepo";
import { Layout } from "./components/layout/Layout";

export default function App() {
  return (
    <>
      <Authenticated>
        <SelectedRepoProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/github/callback" element={<GitHubCallback />} />
              <Route path="/" element={<TimelineWrapper />} />
            </Route>
          </Routes>
        </SelectedRepoProvider>
      </Authenticated>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
    </>
  );
}

function TimelineWrapper() {
  useCurrentUser();
  return <ActivityTimeline />;
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

