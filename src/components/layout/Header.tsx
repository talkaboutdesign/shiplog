import { UserButton } from "@clerk/clerk-react";

interface HeaderProps {
  actions?: React.ReactNode;
}

export function Header({ actions }: HeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background p-4">
      <div className="container mx-auto flex items-center justify-between">
        <h1 className="text-xl font-bold">ShipLog</h1>
        <div className="flex items-center gap-3">
          {actions}
          <UserButton />
        </div>
      </div>
    </header>
  );
}
