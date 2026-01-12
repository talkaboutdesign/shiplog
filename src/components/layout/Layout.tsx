import { Outlet } from "react-router-dom";
import { AppShell } from "./AppShell";
import { HeaderActionsProvider, useHeaderActions } from "./HeaderActionsContext";

function LayoutContent() {
  const { headerActions } = useHeaderActions();
  return (
    <AppShell headerActions={headerActions}>
      <Outlet />
    </AppShell>
  );
}

export function Layout() {
  return (
    <HeaderActionsProvider>
      <LayoutContent />
    </HeaderActionsProvider>
  );
}
