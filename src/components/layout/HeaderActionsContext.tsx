import { createContext, useContext, useState, ReactNode } from "react";

const HeaderActionsContext = createContext<{
  headerActions: ReactNode;
  setHeaderActions: (actions: ReactNode) => void;
} | null>(null);

export function HeaderActionsProvider({ children }: { children: ReactNode }) {
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);

  return (
    <HeaderActionsContext.Provider value={{ headerActions, setHeaderActions }}>
      {children}
    </HeaderActionsContext.Provider>
  );
}

export function useHeaderActions() {
  const context = useContext(HeaderActionsContext);
  if (!context) {
    throw new Error("useHeaderActions must be used within HeaderActionsProvider");
  }
  return context;
}
