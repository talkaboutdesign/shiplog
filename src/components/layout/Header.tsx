import { Link } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { RepoSelector } from "./RepoSelector";
import { ThemeToggle } from "./ThemeToggle";

interface HeaderProps {
  actions?: React.ReactNode;
}

export function Header({ actions }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background p-4">
      <div className="container mx-auto flex items-center justify-between">
        <Link to="/" className="text-xl font-bold hover:opacity-80 transition-opacity">
          ShipLog
        </Link>
        <div className="flex items-center gap-2">
          <RepoSelector />
          {actions}
          <ThemeToggle />
          <UserButton />
        </div>
      </div>
    </header>
  );
}
