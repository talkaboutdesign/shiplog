import { UserButton } from "@clerk/clerk-react";

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background p-4">
      <div className="container mx-auto flex items-center justify-between">
        <h1 className="text-xl font-bold">ShipLog</h1>
        <UserButton />
      </div>
    </header>
  );
}
