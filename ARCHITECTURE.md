# ioBroker Object Explorer — Architecture

Mermaid diagrams describing the full project and its internal + external relationships.
Generated overview — not authoritative over the code. See [CLAUDE.md](CLAUDE.md) and [API.md](API.md) for detail.

---

## 1. System context (external world)

How the React SPA talks to the outside: ioBroker adapters, browser storage, PWA, Docker.

```mermaid
flowchart TB
    subgraph Browser["Browser (SPA)"]
        APP["React 18 App<br/>(Vite bundle)"]
        SW["Service Worker<br/>(vite-plugin-pwa)"]
        LS["localStorage<br/>app-settings, filters, panels"]
        IDB["IndexedDB<br/>object cache (2-phase)"]
    end

    subgraph Edge["Edge / Hosting"]
        VITE["Vite dev server<br/>:5173 (proxy /api)"]
        NGINX["nginx (Docker)<br/>single port, /config.js"]
    end

    subgraph ioBroker["ioBroker Backend"]
        REST["REST API adapter<br/>/api/v1/*  (HTTP)"]
        SIO["Socket.io adapter<br/>:8084 (socket.io v2)"]
        SQL["sql.0 adapter<br/>history via sendTo"]
        OBJDB[("Objects DB")]
        STATEDB[("States DB")]
    end

    APP -->|"HTTP fetch /api/v1"| VITE
    APP -->|"WebSocket / long-poll"| SIO
    VITE -->|"proxy VITE_IOBROKER_TARGET"| REST
    NGINX -->|"proxy /api"| REST
    NGINX -->|"proxy /socket.io/"| SIO
    APP -.->|"prod: direct connect option"| REST

    REST --> OBJDB
    REST --> STATEDB
    SIO --> STATEDB
    REST -->|"POST /command/sendTo"| SQL
    SQL --> STATEDB

    APP <--> LS
    APP <--> IDB
    SW -.->|"offline shell"| APP
    NGINX -.->|"IOBROKER_HOST env → /config.js<br/>window.__CONFIG__"| APP

    classDef ext fill:#2d3748,stroke:#63b3ed,color:#fff;
    classDef store fill:#3c366b,stroke:#b794f4,color:#fff;
    class REST,SIO,SQL ext;
    class OBJDB,STATEDB,LS,IDB store;
```

---

## 2. Realtime transport selection

Socket.io default; auto-fallback to REST long-polling.

```mermaid
flowchart LR
    A["App.tsx<br/>transport selection"] --> CHK{"useApiConnectivity<br/>socket reachable?"}
    CHK -->|"yes"| SIO["useSocketIO<br/>socket.io-client@2 :8084"]
    CHK -->|"no / connect_error"| LP["useLongPolling<br/>REST /states/subscribe"]

    SIO -->|"push events<br/>live-patch cache"| QC["React Query cache"]
    LP -->|"poll per namespace<br/>derivePatterns()"| QC
    SIO -.->|"fallback on error"| LP

    QC --> UI["StateList / StateTree<br/>re-render"]
    SIO --> HB["HostConnectedButton<br/>status badge"]
    LP --> HB

    classDef warn fill:#742a2a,stroke:#fc8181,color:#fff;
    class LP warn;
```

> ⚠️ Socket.io path has **no auth** — trusted networks only.

---

## 3. Data flow (query pipeline)

```mermaid
flowchart TD
    SB["SearchBar<br/>pattern input"] --> FC["FilterContext<br/>pattern, colFilters, pagination"]
    FC --> HObj["useAllObjects / useFilteredObjects<br/>staleTime: Infinity"]
    HObj --> API["api/iobroker.ts<br/>getObjectView (2-phase)"]
    API --> IDB[("IndexedDB cache")]

    HObj --> SL["StateList (paged table)"]
    HObj --> ST["StateTree (full namespace)"]

    SL --> SV["useStateValues(pageIds)<br/>batched, 30s poll"]
    SV --> API2["api: /state/id1,id2,...<br/>bulk-by-id, URL-chunked"]

    SL -->|"row click / right-click"| OEM["ObjectEditModal"]
    SL -->|"history icon"| HM["HistoryModal → HistoryChart"]
    HM --> HIST["api: sendTo sql.0 getHistory"]

    subgraph Derived["Derived maps (from allObjects)"]
        RM["useRoomMap / useRoomEnums"]
        FM["useFunctionMap / useFunctionEnums"]
        AM["useAliasMap (reverse map)"]
    end
    HObj --> Derived
    Derived --> SL

    classDef api fill:#22543d,stroke:#68d391,color:#fff;
    class API,API2,HIST api;
```

---

## 4. React context / provider tree

```mermaid
flowchart TD
    MAIN["main.tsx<br/>createRoot + StrictMode"] --> APP["App.tsx"]
    APP --> EB["ErrorBoundary"]
    EB --> QCP["QueryClientProvider"]
    QCP --> TP["ThemeProvider<br/>dark/light/obsidian"]
    TP --> TOAST["ToastProvider"]
    TOAST --> TT["TooltipProvider"]
    TT --> UICtx["UIContextProvider"]
    UICtx --> ACtx["AppSettingsCtx (stable)"]
    UICtx --> OCtx["UIOverlayCtx (volatile)"]
    TT --> FCtx["FilterContextProvider"]
    TT --> SCtx["SelectionContextProvider"]
    TT --> PCtx["PanelContextProvider ×2<br/>(dual-pane)"]

    PCtx --> LAYOUT["Layout (shell + sidebar)"]
    LAYOUT --> SBAR["SearchBar"]
    LAYOUT --> STREE["StateTree"]
    LAYOUT --> SLIST["StateList"]

    classDef ctx fill:#2a4365,stroke:#63b3ed,color:#fff;
    class QCP,TP,TOAST,TT,UICtx,ACtx,OCtx,FCtx,SCtx,PCtx ctx;
```

---

## 5. Component hierarchy (UI)

```mermaid
flowchart TD
    LAYOUT["Layout"] --> HDR["Header: HostConnectedButton,<br/>LanguageDropdown, theme toggle"]
    LAYOUT --> SBAR["SearchBar"]
    LAYOUT --> STREE["StateTree (useTreeState)"]
    LAYOUT --> SLIST["StateList (virtualized)"]

    SLIST --> TB["StateListToolbar"]
    SLIST --> BB["StateListBatchBar → BatchComboControl"]
    SLIST --> ROW["StateRow ×N"]
    ROW --> CELLS["Editable* cells<br/>Name/Role/Room/Function/Type/Unit/Value"]
    CELLS --> CM["ContextMenu (portal)"]

    SLIST --> SLM["StateListModals (useStateListModals)"]
    SLM --> OEM["ObjectEditModal"]
    OEM --> TABS["Tabs: Details / JSON / Alias /<br/>Custom / Scripts / History / SmartName"]

    SLM --> M1["History / Value / New / Import"]
    SLM --> M2["CreateAlias / AutoCreateAlias /<br/>AliasReplace / Copy / Rename / Move"]
    SLM --> M3["Optimize / TreeStats / VirtualFolders /<br/>EnumManager / DbOverview / DpValues"]
    TB --> SET["SettingsModal"]
    TB --> HELP["HelpModal"]

    classDef modal fill:#44337a,stroke:#b794f4,color:#fff;
    class OEM,M1,M2,M3,SET,HELP modal;
```

---

## 6. Module layers (source map)

```mermaid
flowchart LR
    subgraph types["src/types"]
        T["iobroker.ts<br/>State/Object/History/TreeNode"]
    end
    subgraph api["src/api"]
        IO["iobroker.ts<br/>REST client, sendTo, alias/enum maps"]
    end
    subgraph hooks["src/hooks"]
        Q["useObjectQueries"]
        M["useObjectMutations"]
        EM["useEnumMutations"]
        ST["useStates (barrel)"]
        LP2["useLongPolling"]
        SIO2["useSocketIO"]
        VIEW["useStateListView"]
        TREE["useTreeState"]
        MODS["useStateListModals"]
        QK["queryKeys"]
    end
    subgraph ctx["src/context"]
        C["Theme / UI / Filter / Panel /<br/>Selection / Toast"]
    end
    subgraph utils["src/utils"]
        U["format, i18n, clipboard, coloredId,<br/>filterObjectIds, roleColor, typeColor,<br/>aliasFormula, idPatterns, validation"]
    end
    subgraph comp["src/components"]
        CO["StateList, StateTree, modals,<br/>tabs, cells, ui, history"]
    end

    CO --> hooks
    CO --> ctx
    CO --> utils
    hooks --> api
    hooks --> QK
    api --> T
    hooks --> T
    ST --> Q
    ST --> M
    M --> EM

    classDef l fill:#1a365d,stroke:#63b3ed,color:#fff;
    class types,api,hooks,ctx,utils,comp l;
```

---

## 7. External API surface (ioBroker endpoints used)

```mermaid
flowchart LR
    APP["App"] -->|"POST /command/getObjectView"| OBJ["objects (2-phase load)"]
    APP -->|"GET /state/id1,id2,..."| BULK["bulk state values"]
    APP -->|"GET /states?filter=pattern"| FILT["filtered states"]
    APP -->|"GET/PUT/POST/DELETE /object/{id}"| CRUD["object CRUD"]
    APP -->|"PATCH /state/{id}"| SETV["set value (optimistic)"]
    APP -->|"POST /command/sendTo → sql.0"| SEND["getHistory, getDpOverview,<br/>query, delete/deleteRange/deleteAll"]
    APP -->|"GET /states/subscribe"| SUB["long-poll fallback"]
    APP -->|"socket.io :8084"| WS["realtime push"]

    classDef api fill:#22543d,stroke:#68d391,color:#fff;
    class OBJ,BULK,FILT,CRUD,SETV,SEND,SUB,WS api;
```

---

**Stack:** React 18 · TanStack Query v5 · react-virtual · Recharts · Tailwind · Vite · Vitest · socket.io-client v2 · PWA
