import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';

type EditTab = 'details' | 'json' | 'alias' | 'custom' | 'scripts' | 'smartname';

interface SelectionContextValue {
  selectedId: string | null;
  editInitialTab: EditTab | undefined;
  historyModalId: string | null;
  newDatapointInitialId: string | null;
  enumManagerOpen: boolean;
  aliasReplaceInitialStr: string | null;
  autoAliasDeviceId: string | null;
  /** Restricts AutoCreateAliasModal to these source states; null = every child state. */
  autoAliasSourceIds: string[] | null;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  setEditInitialTab: React.Dispatch<React.SetStateAction<EditTab | undefined>>;
  setHistoryModalId: React.Dispatch<React.SetStateAction<string | null>>;
  setNewDatapointInitialId: React.Dispatch<React.SetStateAction<string | null>>;
  setEnumManagerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setAliasReplaceInitialStr: React.Dispatch<React.SetStateAction<string | null>>;
  setAutoAliasDeviceId: React.Dispatch<React.SetStateAction<string | null>>;
  setAutoAliasSourceIds: React.Dispatch<React.SetStateAction<string[] | null>>;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useSelectionContext(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelectionContext must be used inside SelectionContextProvider');
  return ctx;
}

export function SelectionContextProvider({ children }: { children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editInitialTab, setEditInitialTab] = useState<EditTab | undefined>(undefined);
  const [historyModalId, setHistoryModalId] = useState<string | null>(null);
  const [newDatapointInitialId, setNewDatapointInitialId] = useState<string | null>(null);
  const [enumManagerOpen, setEnumManagerOpen] = useState(false);
  const [aliasReplaceInitialStr, setAliasReplaceInitialStr] = useState<string | null>(null);
  const [autoAliasDeviceId, setAutoAliasDeviceId] = useState<string | null>(null);
  const [autoAliasSourceIds, setAutoAliasSourceIds] = useState<string[] | null>(null);

  const value = useMemo<SelectionContextValue>(() => ({
    selectedId, editInitialTab, historyModalId, newDatapointInitialId,
    enumManagerOpen, aliasReplaceInitialStr, autoAliasDeviceId, autoAliasSourceIds,
    setSelectedId, setEditInitialTab, setHistoryModalId, setNewDatapointInitialId,
    setEnumManagerOpen, setAliasReplaceInitialStr, setAutoAliasDeviceId, setAutoAliasSourceIds,
  }), [selectedId, editInitialTab, historyModalId, newDatapointInitialId,
    enumManagerOpen, aliasReplaceInitialStr, autoAliasDeviceId, autoAliasSourceIds,
    setSelectedId, setEditInitialTab, setHistoryModalId, setNewDatapointInitialId,
    setEnumManagerOpen, setAliasReplaceInitialStr, setAutoAliasDeviceId, setAutoAliasSourceIds]);

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}
