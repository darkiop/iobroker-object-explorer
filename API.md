# ioBroker REST-API – Übersicht

**Basis-URL:** `http://<host>:8093/api/v1`
**Swagger-UI:** `http://<host>:8093/api-doc/`
**Authentifizierung:** HTTP Basic Auth oder Bearer Token

---

## Aktuell verwendete Endpoints

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `GET` | `/objects?type=...` | Alle Objekte laden (type: state, device, channel, folder, enum) |
| `GET` | `/object/{id}` | Einzelnes Objekt laden |
| `PUT` | `/object/{id}` | Objekt anlegen oder vollständig ersetzen |
| `DELETE` | `/object/{id}` | Objekt löschen |
| `GET` | `/state/{id}` | State-Wert + Metadaten lesen |
| `PATCH` | `/state/{id}` | State-Wert schreiben (`{"val": ...}`) |
| `POST` | `/command/sendTo` | sql.0-Adapter ansprechen (getHistory, delete, deleteRange, deleteAll) |

---

## Nicht verwendete Endpoints (mit Nutzungspotenzial)

### States

| Methode | Pfad | Beschreibung | Potenzial |
|---------|------|--------------|-----------|
| `GET` | `/states?filter=<pattern>` | Liste von States per Muster (z.B. `hm-rpc.*`) | Alternativ zu `/objects` für schnelles Filtern |
| `GET` | `/state/{id}/plain` | Nur den rohen Wert zurückgeben (kein JSON-Overhead) | Leichtgewichtige Polling-Alternative |
| `GET` | `/state/{id}/toggle` | Boolean-State direkt toggeln | Schnell-Toggle-Button in der Tabelle |
| `POST` | `/state/{id}/subscribe` | Webhook-Subscription auf State-Änderungen | Push statt Polling (30s → Echtzeit) |
| `DELETE` | `/state/{id}/subscribe` | Subscription aufheben | — |
| `GET` | `/states/subscribe` | Aktive Subscriptions auflisten | Debugging |
| `POST` | `/states/subscribe` | Bulk-Subscription auf State-Pattern | — |

### Objekte

| Methode | Pfad | Beschreibung | Potenzial |
|---------|------|--------------|-----------|
| `POST` | `/object/{id}` | Objekt erstellen (statt PUT) | Sicherere Create-Variante |
| `POST` | `/object/{id}/subscribe` | Webhook auf Objekt-Änderungen | Live-Updates bei Metadaten-Änderungen |
| `DELETE` | `/object/{id}/subscribe` | Subscription aufheben | — |
| `POST` | `/objects/subscribe` | Bulk-Subscription auf Objekt-Pattern | — |

### Enums (Räume / Funktionen)

| Methode | Pfad | Beschreibung | Potenzial |
|---------|------|--------------|-----------|
| `GET` | `/enum` | Alle Enum-Kategorien (rooms, functions, favorites, …) | Basis für Enum-Übersicht |
| `GET` | `/enum/{enumId}` | Einzelnen Enum lesen (z.B. `rooms`, `functions`) | Direkter als `/objects?type=enum` |

### History

| Methode | Pfad | Beschreibung | Potenzial |
|---------|------|--------------|-----------|
| `GET` | `/getHistory/{id}?start=&end=&count=&aggregate=` | History per GET (alternativ zu sendTo) | Einfacher als POST/sendTo |
| `POST` | `/getHistory` | History per POST-Body | Flexibler, mehrere States? |
| `POST` | `/addHistory` | Einzelnen History-Eintrag hinzufügen | Import von Messdaten (FE-047) |
| `GET` | `/addHistory/{id}?val=&ts=&ack=` | History-Eintrag per GET hinzufügen | — |

### Dateisystem (vis, backups, etc.)

| Methode | Pfad | Beschreibung | Potenzial |
|---------|------|--------------|-----------|
| `GET` | `/file/{objectId}/{fileName}` | Datei lesen (z.B. vis-Views, Icons) | VIS-Integration, Icon-Preview |
| `POST` | `/file/{objectId}/{fileName}` | Datei schreiben | — |
| `DELETE` | `/file/{objectId}/{fileName}` | Datei löschen | — |
| `GET` | `/dir/{objectId}/{dirName}` | Verzeichnis auflisten | — |

### sendTo (direkte Adapter-Kommunikation)

| Methode | Pfad | Beschreibung | Potenzial |
|---------|------|--------------|-----------|
| `GET` | `/sendto/{instance}?message=&data=` | Nachricht an Adapter-Instanz | Flexibler Adapter-Aufruf (history.0, influxdb.0, …) |
| `POST` | `/sendto/{instance}` | Nachricht per POST-Body | Für FE-041 (andere History-Adapter) |

### System-Commands (`/command/...`)

Alle Commands werden per `GET /command/<name>?param=value` aufgerufen.

| Command | Beschreibung | Potenzial |
|---------|--------------|-----------|
| `getAdapterInstances?adapterName=sql` | Installierte Instanzen eines Adapters | FE-041: verfügbare History-Adapter erkennen |
| `getCompactInstances` | Alle Instanzen mit Kurzinfo | Adapter-Status-Übersicht |
| `getForeignStates?pattern=*` | States per Muster abrufen | Alternativ zu `/states` |
| `getForeignObjects?pattern=*&type=state` | Objekte per Muster | Alternativ zu `/objects` |
| `getObjectView?design=system&search=state` | Objekte nach Typ (CouchDB-View-Stil) | Effizientere Queries |
| `getHistory` | History wie sendTo, aber per Command-API | — |
| `log?text=...&level=info` | Log-Eintrag in ioBroker schreiben | Debugging aus dem Explorer |
| `readLogs` | Log-Dateinamen und -größen abrufen | Log-Viewer |
| `encrypt?plainText=...` | String mit System-Secret verschlüsseln | Passwort-Felder in native |
| `decrypt?encryptedText=...` | String entschlüsseln | — |
| `httpGet?url=...` | URL vom ioBroker-Server abrufen | Proxy für externe APIs |
| `extendObject?id=...&obj=...` | Objekt partial updaten (GET-Variante) | Alternativ zu PUT |
| `delObjects?id=pattern` | Mehrere Objekte per Muster löschen | Bulk-Delete (FE-006) |
| `delState?id=...` | State + Objekt löschen | — |
| `setBinaryState?id=...&base64=...` | Binären State setzen | — |
| `getBinaryState?id=...` | Binären State lesen | — |
| `checkFeatureSupported?feature=...` | Feature-Flag prüfen | Kompatibilitäts-Check |
| `getVersion` | Adapter-Name und Version | Info-Anzeige |
| `getCurrentInstance` | Aktuelle Adapter-Instanz | — |
| `getUserPermissions` | Berechtigungen des aktuellen Benutzers | Auth-Anzeige |
| `addUser / delUser / changePassword` | Benutzerverwaltung | — |
| `addGroup / delGroup` | Gruppenverwaltung | — |
| `readDir / readFile / writeFile64 / mkdir / rename / deleteFile` | Dateisystem-Operationen | — |

---

## Besonders interessante ungenutzte Endpoints

### 1. `/sendto/{instance}` (POST) – Andere History-Adapter
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
→ Ermöglicht **FE-041** (influxdb.0, history.0 neben sql.0).

### 2. `GET /state/{id}/toggle`
```
GET /api/v1/state/alias.0.licht.wohnzimmer/toggle
```
→ Boolean-Datenpunkte direkt toggeln — kein separates Lesen nötig.

### 3. `GET /getHistory/{id}` – Vereinfachter History-Zugriff
```
GET /api/v1/getHistory/hm-rpc.0.SENSOR.TEMP?start=1700000000000&end=1700086400000&aggregate=average&count=100
```
→ Einfacher als `POST /command/sendTo` mit verschachteltem Body.

### 4. `POST /addHistory` – History-Import
```json
POST /api/v1/addHistory
{
  "id": "0_userdata.0.import.temp",
  "state": { "val": 21.5, "ts": 1700000000000, "ack": true }
}
```
→ Direkte Basis für **FE-047** (CSV-Import).

### 5. `GET /command/getAdapterInstances?adapterName=sql`
→ Prüfen welche History-Adapter (sql.0, influxdb.0, history.0) installiert sind, um den Adapter-Selector für **FE-041** zu befüllen.

### 6. `POST /state/{id}/subscribe` – Webhooks statt Polling
```json
POST /api/v1/state/alias.0.licht.wohnzimmer/subscribe
{
  "url": "http://myserver/webhook",
  "method": "POST",
  "onchange": true
}
```
→ Push-Updates statt 30s-Polling — signifikante Performance-Verbesserung möglich.

### 7. `GET /command/delObjects?id=pattern.*`
→ Pattern-basiertes Bulk-Delete — nützlich für **FE-006** (Mehrfach-Löschen).

---

## Subscription-Mechanismus

Die API bietet Webhook-basierte Subscriptions für States und Objekte:

```
POST /api/v1/state/{id}/subscribe
POST /api/v1/states/subscribe        (Pattern-basiert)
POST /api/v1/object/{id}/subscribe
POST /api/v1/objects/subscribe       (Pattern-basiert)
```

Aktive Subscriptions auflisten:
```
GET /api/v1/states/subscribe?method=POST&url=http://...
```

Subscription löschen:
```
DELETE /api/v1/state/{id}/subscribe
```

→ Damit wäre **Echtzeit-Updates** (FE-Verbesserung) ohne Polling möglich.

---

## Authentifizierung

- **Basic Auth:** `Authorization: Basic base64(user:pass)`
- **Bearer Token:** `Authorization: Bearer <token>`
- Token-Ablauf verlängern: `GET /command/updateTokenExpiration?accessToken=<token>`
