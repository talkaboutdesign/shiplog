import { Header } from "./Header";

interface AppShellProps {
  children: React.ReactNode;
  headerActions?: React.ReactNode;
}

export function AppShell({ children, headerActions }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header actions={headerActions} />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
