# ioBroker REST API – Overview

**Base URL:** `http://<host>:8093/api/v1`
**Swagger UI:** `http://<host>:8093/api-doc/`
**Authentication:** HTTP Basic Auth or Bearer Token

---

## Currently Used Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/objects?type=...` | Load all objects (type: state, device, channel, folder, enum) |
| `GET` | `/object/{id}` | Load single object |
| `PUT` | `/object/{id}` | Create or fully replace object |
| `DELETE` | `/object/{id}` | Delete object |
| `GET` | `/state/{id}` | Read state value + metadata |
| `PATCH` | `/state/{id}` | Write state value (`{"val": ...}`) |
| `POST` | `/command/sendTo` | Talk to sql.0 adapter (getHistory, delete, deleteRange, deleteAll) |

---

## Unused Endpoints (with potential)

### States

| Method | Path | Description | Potential |
|--------|------|-------------|-----------|
| `GET` | `/states?filter=<pattern>` | List states by pattern (e.g. `hm-rpc.*`) | Alternative to `/objects` for fast filtering |
| `GET` | `/state/{id}/plain` | Return raw value only (no JSON overhead) | Lightweight polling alternative |
| `GET` | `/state/{id}/toggle` | Toggle boolean state directly | Quick-toggle button in table |
| `POST` | `/state/{id}/subscribe` | Webhook subscription on state changes | Push instead of polling (30s → realtime) |
| `DELETE` | `/state/{id}/subscribe` | Remove subscription | — |
| `GET` | `/states/subscribe` | List active subscriptions | Debugging |
| `POST` | `/states/subscribe` | Bulk subscription on state pattern | — |

### Objects

| Method | Path | Description | Potential |
|--------|------|-------------|-----------|
| `POST` | `/object/{id}` | Create object (instead of PUT) | Safer create variant |
| `POST` | `/object/{id}/subscribe` | Webhook on object changes | Live updates on metadata changes |
| `DELETE` | `/object/{id}/subscribe` | Remove subscription | — |
| `POST` | `/objects/subscribe` | Bulk subscription on object pattern | — |

### Enums (Rooms / Functions)

| Method | Path | Description | Potential |
|--------|------|-------------|-----------|
| `GET` | `/enum` | All enum categories (rooms, functions, favorites, …) | Base for enum overview |
| `GET` | `/enum/{enumId}` | Read single enum (e.g. `rooms`, `functions`) | More direct than `/objects?type=enum` |

### History

| Method | Path | Description | Potential |
|--------|------|-------------|-----------|
| `GET` | `/getHistory/{id}?start=&end=&count=&aggregate=` | History via GET (alternative to sendTo) | Simpler than POST/sendTo |
| `POST` | `/getHistory` | History via POST body | More flexible, multiple states? |
| `POST` | `/addHistory` | Add single history entry | Import measurement data (FE-047) |
| `GET` | `/addHistory/{id}?val=&ts=&ack=` | Add history entry via GET | — |

### Filesystem (vis, backups, etc.)

| Method | Path | Description | Potential |
|--------|------|-------------|-----------|
| `GET` | `/file/{objectId}/{fileName}` | Read file (e.g. vis views, icons) | VIS integration, icon preview |
| `POST` | `/file/{objectId}/{fileName}` | Write file | — |
| `DELETE` | `/file/{objectId}/{fileName}` | Delete file | — |
| `GET` | `/dir/{objectId}/{dirName}` | List directory | — |

### sendTo (Direct Adapter Communication)

| Method | Path | Description | Potential |
|--------|------|-------------|-----------|
| `GET` | `/sendto/{instance}?message=&data=` | Message to adapter instance | Flexible adapter call (history.0, influxdb.0, …) |
| `POST` | `/sendto/{instance}` | Message via POST body | For FE-041 (other history adapters) |

### System Commands (`/command/...`)

All commands called via `GET /command/<name>?param=value`.

| Command | Description | Potential |
|---------|-------------|-----------|
| `getAdapterInstances?adapterName=sql` | Installed instances of an adapter | FE-041: detect available history adapters |
| `getCompactInstances` | All instances with brief info | Adapter status overview |
| `getForeignStates?pattern=*` | States by pattern | Alternative to `/states` |
| `getForeignObjects?pattern=*&type=state` | Objects by pattern | Alternative to `/objects` |
| `getObjectView?design=system&search=state` | Objects by type (CouchDB view style) | More efficient queries |
| `getHistory` | History like sendTo, but via command API | — |
| `log?text=...&level=info` | Write log entry to ioBroker | Debugging from explorer |
| `readLogs` | Get log file names and sizes | Log viewer |
| `encrypt?plainText=...` | Encrypt string with system secret | Password fields in native |
| `decrypt?encryptedText=...` | Decrypt string | — |
| `httpGet?url=...` | Fetch URL from ioBroker server | Proxy for external APIs |
| `extendObject?id=...&obj=...` | Partial object update (GET variant) | Alternative to PUT |
| `delObjects?id=pattern` | Delete multiple objects by pattern | Bulk delete (FE-006) |
| `delState?id=...` | Delete state + object | — |
| `setBinaryState?id=...&base64=...` | Set binary state | — |
| `getBinaryState?id=...` | Read binary state | — |
| `checkFeatureSupported?feature=...` | Check feature flag | Compatibility check |
| `getVersion` | Adapter name and version | Info display |
| `getCurrentInstance` | Current adapter instance | — |
| `getUserPermissions` | Current user permissions | Auth display |
| `addUser / delUser / changePassword` | User management | — |
| `addGroup / delGroup` | Group management | — |
| `readDir / readFile / writeFile64 / mkdir / rename / deleteFile` | Filesystem operations | — |

---

## Especially Interesting Unused Endpoints

### 1. `/sendto/{instance}` (POST) – Other History Adapters
```json
POST /api/v1/sendto/influxdb.0
{
  "command": "getHistory",
  "message": {
    "id": "hm-rpc.0.SENSOR.TEMPERATURE",
    "options": { "start": 1700000000000, "end": 1700086400000, "aggregate": "average" }
  }
}
```
→ Enables **FE-041** (influxdb.0, history.0 alongside sql.0).

### 2. `GET /state/{id}/toggle`
```
GET /api/v1/state/alias.0.licht.wohnzimmer/toggle
```
→ Toggle boolean datapoints directly — no separate read needed.

### 3. `GET /getHistory/{id}` – Simplified History Access
```
GET /api/v1/getHistory/hm-rpc.0.SENSOR.TEMP?start=1700000000000&end=1700086400000&aggregate=average&count=100
```
→ Simpler than `POST /command/sendTo` with nested body.

### 4. `POST /addHistory` – History Import
```json
POST /api/v1/addHistory
{
  "id": "0_userdata.0.import.temp",
  "state": { "val": 21.5, "ts": 1700000000000, "ack": true }
}
```
→ Direct foundation for **FE-047** (CSV import).

### 5. `GET /command/getAdapterInstances?adapterName=sql`
→ Check which history adapters (sql.0, influxdb.0, history.0) are installed to populate the adapter selector for **FE-041**.

### 6. `POST /state/{id}/subscribe` – Webhooks Instead of Polling
```json
POST /api/v1/state/alias.0.licht.wohnzimmer/subscribe
{
  "url": "http://myserver/webhook",
  "method": "POST",
  "onchange": true
}
```
→ Push updates instead of 30s polling — significant performance improvement possible.

### 7. `GET /command/delObjects?id=pattern.*`
→ Pattern-based bulk delete — useful for **FE-006** (multi-delete).

---

## Subscription Mechanism

The API offers webhook-based subscriptions for states and objects:

```
POST /api/v1/state/{id}/subscribe
POST /api/v1/states/subscribe        (pattern-based)
POST /api/v1/object/{id}/subscribe
POST /api/v1/objects/subscribe       (pattern-based)
```

List active subscriptions:
```
GET /api/v1/states/subscribe?method=POST&url=http://...
```

Remove subscription:
```
DELETE /api/v1/state/{id}/subscribe
```

→ Enables **realtime updates** without polling.

---

## Authentication

- **Basic Auth:** `Authorization: Basic base64(user:pass)`
- **Bearer Token:** `Authorization: Bearer <token>`
- Extend token expiry: `GET /command/updateTokenExpiration?accessToken=<token>`

---

## Socket.io Realtime Transport

**Adapter:** `ioBroker.socketio` (separate adapter, default port `8084`)
**Client:** `socket.io-client@2` — adapter runs as v2.x server; v3/v4 clients are incompatible.
**Protocol:** WebSocket (fallback: HTTP Polling)

> **No auth support** — neither credentials nor tokens are accepted by the socketio adapter.

### URL Resolution (`getSocketUrl`)

| Mode | URL |
|------|-----|
| **Docker** (`window.__CONFIG__.ioBrokerHost` set) | `https?://window.location.host` — nginx proxies `/socket.io/` → `ioBrokerHost:8084` |
| **Dev / Direct connection** (`socketHost` in AppSettings) | `http://<socketHost>` |
| **Dev fallback** | REST host + port `8084` (e.g. `http://10.4.0.33:8084`) |

In Docker, port 8084 is not directly reachable — the browser talks exclusively to nginx via the app port, which proxies internally.

---

### Event Protocol (ioBroker socket.io v2)

#### Client → Server (Subscriptions)

Each subscription emits with callback for error handling:

```js
socket.emit(event, pattern, (err) => { /* err === null on success */ })
```

| Event | Direction | Parameters | Description |
|-------|-----------|------------|-------------|
| `subscribe` | C → S | `pattern: string` | Subscribe to state changes for namespace pattern (e.g. `hm-rpc.0.*`) |
| `unsubscribe` | C → S | `pattern: string` | Remove state subscription |
| `subscribeObjects` | C → S | `pattern: string` | Subscribe to object changes for pattern |
| `unsubscribeObjects` | C → S | `pattern: string` | Remove object subscription |

#### Server → Client (Push Events)

| Event | Parameters | Description |
|-------|------------|-------------|
| `stateChange` | `(id: string, state: IoBrokerState \| null)` | State value changed; `state === null` when state deleted |
| `objectChange` | `(id: string, obj: IoBrokerObject \| null)` | Object metadata changed; `obj === null` when deleted |

#### Socket Lifecycle Events

| Event | Meaning | Action |
|-------|---------|--------|
| `connect` | Connection established | `supported = true`, `connected = true`; re-subscribe all visible patterns |
| `disconnect` | Connection lost | `connected = false`; socket.io reconnect timer runs |
| `connect_error` | Connection failed | `supported = false` (after first error); app activates long-polling fallback |

---

### Pattern Subscriptions (Diff-based)

Subscriptions are limited to `adapter.instance` namespaces of currently visible IDs — identical to long-polling logic (`derivePatterns()`):

```
Visible IDs                         Subscriptions
────────────────────────────────────────────────────
hm-rpc.0.MEQ1234567.1.STATE    →   subscribe('hm-rpc.0.*')
hm-rpc.0.MEQ1234567.1.LOWBAT  →   (already covered)
alias.0.heating.temp            →   subscribe('alias.0.*')
```

**Diff resubscribe:** On page navigation only delta patterns (added/removed) are (un)subscribed — no full teardown+rebuild. Already running subscriptions remain active.

**Reconnect:** Server forgets subscriptions on reconnect. `connect` handler performs full re-subscription of all currently visible patterns.

**Error handling:** Failed `subscribe`/`subscribeObjects` emits are retried once after 5s. `unsubscribe` errors are only logged (`console.warn`).

---

### Cache Updates on Push Events

Incoming events are patched directly into React Query caches — no polling roundtrip:

| Event | Affected Query Keys |
|-------|---------------------|
| `stateChange` | `states.values*` (all batch queries containing the ID) + `states.detail(id)` |
| `objectChange` | `objects.all`, `objects.bootstrap`, `objects.detail(id)`; on `obj === null` detail query is removed |

---

### Connection Flow

```
Browser                                    Socket.io Adapter :8084
   │                                                │
   │── io(url, { transports: ['websocket','polling'] }) ──►│
   │◄── connect ────────────────────────────────────│
   │                                                │
   │── subscribe('hm-rpc.0.*', cb) ────────────────►│  cb(null)
   │── subscribeObjects('hm-rpc.0.*', cb) ──────────►│  cb(null)
   │── subscribe('alias.0.*', cb) ─────────────────►│  cb(null)
   │── subscribeObjects('alias.0.*', cb) ───────────►│  cb(null)
   │                                                │
   │◄── stateChange('hm-rpc.0.X.STATE', {...}) ─────│  Push on value change
   │◄── objectChange('alias.0.y', {...}) ────────────│  Push on metadata change
   │                                                │
   │  [Page navigation: new pattern set]            │
   │── unsubscribe('alias.0.*', cb) ────────────────►│  Diff only
   │── unsubscribeObjects('alias.0.*', cb) ──────────►│
   │── subscribe('0_userdata.0.*', cb) ─────────────►│
   │── subscribeObjects('0_userdata.0.*', cb) ───────►│
   │                                                │
   │  [Connection lost]                             │
   │◄── disconnect ──────────────────────────────────│
   │── [reconnect after 5s] ────────────────────────►│
   │◄── connect ────────────────────────────────────│
   │── [full re-subscription] ──────────────────────►│
```

---

### Fallback Behavior

| Condition | Behavior |
|-----------|----------|
| `connect_error` (adapter unreachable) | `supported = false`; app activates long-polling in parallel as live fallback |
| Reconnect after outage | `supported = true`, `connected = true`; re-subscription of all patterns |
| Manually switched to long polling | Socket.io hook disabled (`enabled = false`); no socket connection |
