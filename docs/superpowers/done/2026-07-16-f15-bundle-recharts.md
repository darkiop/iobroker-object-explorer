# F-15 — Bundle-Monitoring + recharts aus Initial-Chunk

## Context

Audit-Finding **F-15** (Performance/LOW, [findings.md:27](../../../findings.md#L27)): Kein Bundle-Monitoring, und
`recharts` (~400 kB, schwerste Dependency) landet im Initial-Chunk.

**Verifizierte Import-Kette** (Finding nannte DetailsTab — veraltet, real ist HistoryTab):

```
App.tsx / StateTree.tsx / StateListModals.tsx
  → ObjectEditModal   (statischer Import, NICHT lazy)
    → HistoryTab       (statischer Import, ObjectEditModal.tsx:15)
      → HistoryChart   (HistoryTab.tsx:2)
        → recharts
```

DetailsTab hat **keinen** Chart mehr. Weil ObjectEditModal an 3 Stellen statisch importiert wird,
zieht die Kette recharts in den Haupt-Chunk — obwohl HistoryModal/HistoryChart sonst lazy sind.

**Ziel:** recharts nur laden wenn (a) ein Objekt-Modal geöffnet wird und (b) darin der History-Tab
aktiv ist. Plus Bundle-Analyse-Tooling für künftiges Monitoring.

## Änderungen

### 1. `rollup-plugin-visualizer` in Build aufnehmen
- Dev-Dependency: `npm i -D rollup-plugin-visualizer`
- [vite.config.ts](../../../vite.config.ts): Plugin in `plugins`-Array, nur bei `mode === 'production'`
  (oder ENV-Flag `ANALYZE`), damit Dev-Server unberührt bleibt. Output `dist/stats.html`,
  `gzipSize: true, brotliSize: true`.
- Aktuell gibt es keine `build.rollupOptions` — nichts zu erhalten, nur Plugin ergänzen.

### 2. HistoryTab lazy laden (recharts-Kette brechen)
- [ObjectEditModal.tsx:15](../../../src/components/modals/ObjectEditModal.tsx#L15): statischen Import
  durch `const HistoryTab = lazy(() => import('../tabs/HistoryTab'))` ersetzen.
- Render-Stelle [ObjectEditModal.tsx:408](../../../src/components/modals/ObjectEditModal.tsx#L408)
  (`{tab === 'history' && <HistoryTab .../>}`) in `<Suspense fallback={null}>` wrappen.
  `lazy`/`Suspense` aus React importieren (Zeile 1 ergänzen).
- Effekt: recharts lädt erst bei Klick auf History-Tab — nicht schon beim Öffnen des Modals.

### 3. ObjectEditModal lazy laden (aus Initial-Chunk lösen)
An allen 3 Render-Sites (alle bereits konditional gerendert → drop-in `lazy()` + `<Suspense>`):
- [App.tsx:13](../../../src/App.tsx#L13) → `lazy()` analog vorhandener Modals (Zeile 15–24 Muster);
  Render-Site [App.tsx:833](../../../src/App.tsx#L833) in `<Suspense fallback={null}>`. `lazy`/`Suspense`
  bereits importiert.
- [StateTree.tsx:4](../../../src/components/StateTree.tsx#L4) → `lazy()`; Render-Site
  [StateTree.tsx:222](../../../src/components/StateTree.tsx#L222) in Suspense.
- [StateListModals.tsx:7](../../../src/components/modals/StateListModals.tsx#L7) → `lazy()`; Render-Site
  [StateListModals.tsx:322](../../../src/components/modals/StateListModals.tsx#L322) in Suspense.
- `lazy`/`Suspense`-Import in StateTree + StateListModals ergänzen wo nötig.

> Nur `import ObjectEditModal from` (default) betroffen — der Test
> [ObjectEditModal.test.tsx:78](../../../src/components/modals/ObjectEditModal.test.tsx#L78) importiert die
> Komponente direkt, bleibt unverändert.

## Verifikation
1. `npx tsc --noEmit` + `npm run lint` — sauber.
2. `npm test` — bestehende Tests grün (v.a. ObjectEditModal.test.tsx).
3. `npm run build` → `dist/stats.html` öffnen: prüfen dass `recharts` in eigenem
   lazy-Chunk liegt, **nicht** im Entry/Index-Chunk. Chunk-Namen im Build-Log gegenchecken.
4. `npm run dev`: Objekt-Modal öffnen → Network-Tab zeigt recharts-Chunk erst bei Klick auf
   History-Tab. Modal öffnen/schließen/History-Modal weiterhin funktionsfähig.
5. Nach Merge: findings.md F-15 Status auf `FIXED (<commit>)` setzen (analog F-12).
