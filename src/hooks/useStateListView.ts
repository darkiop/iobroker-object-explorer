import { useState, useRef } from 'react';
import type { SortDir } from '../components/ui/SortHeader';
import type { SortKey } from '../components/statelist/StateListColumns';

export function useStateListView(initialVisibleCols: SortKey[]) {
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [visibleCols, setVisibleCols] = useState<SortKey[]>(initialVisibleCols);
  const [showStats, setShowStats] = useState(false);

  // null = all collapsed, new Set() = all expanded
  const [collapsedPrefixes, setCollapsedPrefixes] = useState<Set<string> | null>(null);
  const [animatingPrefixes, setAnimatingPrefixes] = useState<Set<string>>(new Set());
  const [collapsingPrefixes, setCollapsingPrefixes] = useState<Set<string>>(new Set());
  const animTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const collapseTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const allSepPrefixesRef = useRef<Set<string>>(new Set());
  const animatedSepEls = useRef<WeakSet<Element>>(new WeakSet());

  return {
    sortKey, setSortKey,
    sortDir, setSortDir,
    visibleCols, setVisibleCols,
    showStats, setShowStats,
    collapsedPrefixes, setCollapsedPrefixes,
    animatingPrefixes, setAnimatingPrefixes,
    collapsingPrefixes, setCollapsingPrefixes,
    animTimersRef,
    collapseTimersRef,
    allSepPrefixesRef,
    animatedSepEls,
  };
}
