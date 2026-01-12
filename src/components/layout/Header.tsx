import { Link, useLocation } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { cn } from "@/lib/utils";
import { RepoSelector } from "./RepoSelector";

interface HeaderProps {
  actions?: React.ReactNode;
}

export function Header({ actions }: HeaderProps) {
  const location = useLocation();
  const path = location.pathname;
  const isSummary = path === "/";
  const isFeed = path === "/feed";

  return (
    <header className="sticky top-0 z-10 border-b bg-background p-4">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold">ShipLog</h1>
          <nav className="flex items-center gap-4">
            <Link
              to="/"
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                isSummary
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              Summary
            </Link>
            <Link
              to="/feed"
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                isFeed
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              Feed
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <RepoSelector />
          {actions}
          <UserButton />
        </div>
      </div>
    </header>
  );
}
