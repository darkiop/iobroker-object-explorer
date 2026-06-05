import { createContext, useContext, type ReactNode } from 'react';
import type { SortKey } from '../components/stateListColumns';

export interface PanelContextValue {
  colFilters: Partial<Record<SortKey, string>>;
  handleColFilterChange: (filters: Partial<Record<SortKey, string>>) => void;
  pattern: string;
  treeFilter: string | null;
  handleClearTreeFilter: () => void;
  sidebarToggleSeq: number;
  fulltextEnabled: boolean;
  handleTreeScope: (prefix: string) => void;
}

const PanelContext = createContext<PanelContextValue | null>(null);

export function PanelContextProvider({
  value,
  children,
}: {
  value: PanelContextValue;
  children: ReactNode;
}) {
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanelContext(): PanelContextValue {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('usePanelContext must be used inside PanelContextProvider');
  return ctx;
}
