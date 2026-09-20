# Gala Seating planner (`/galaseating`)

Unlisted, noindex planning tool: drag guests into seats, drag tables around the room, get
warnings when a placement contradicts a guest's notes, export and import arrangements.

## Privacy rule (non-negotiable)

This repo is **public**. Guest names, emails, phones, meal choices, and notes are never
committed, never bundled, never sent anywhere. The page ships empty. Planners import the
Zeffy export and the dinner-selection responses **in the browser**; state lives in
`localStorage`. Tests and demo data use invented names only. Never put guest data in a URL.

## Files and owners

| File | Owner | Purpose |
|---|---|---|
| `model.js` | shared, frozen | Plan / Guest / Table / Warning shapes, constants, read helpers, default room |
| `importers.js` | logic | spreadsheet rows to guests; merge a fresh import into an existing plan |
| `matching.js` | logic | name normalization and purchaser-to-buyer attribution (ported from `marketing/gala-meal-notice/GalaMealFinalNotice.gs`) |
| `preferences.js` | logic | turn free-text seating notes into `guest.prefs` |
| `warnings.js` | logic | `computeWarnings`, `previewPlacement`, `indexWarnings` |
| `autoseat.js` | logic | fill empty seats while honoring parties, notes, locks |
| `exporters.js` | logic | plan JSON in/out with validation, CSV, meal counts, print data |
| `test/run.mjs` | logic | `node src/lib/galaSeating/test/run.mjs`, synthetic fixtures only |
| `store.svelte.js` | UI | runes store: plan state, actions, undo/redo, autosave, backups |
| `demo.js` | UI | invented demo guests so the tool can be tried without real data |
| `xlsxIO.js` | io | read .xlsx/.csv files with SheetJS (dynamic import), detect sheets, download helpers |
| `src/components/galaseating/GalaSeatingApp.svelte` and friends | UI | floor plan, guest list, guest sheet, warnings panel, toolbar |
| `src/components/galaseating/ImportDialog.svelte` | io | import guests (xlsx/csv) or a shared plan (json) |
| `src/components/galaseating/ExportMenu.svelte` | io | export JSON / CSV, print views, backups and named versions |
| `src/components/galaseating/PrintView.svelte` | io | print layouts |
| `src/pages/galaseating.astro` | UI | page shell, `robots="noindex, nofollow"`, excluded from sitemap |

## Logic API (pure functions, no DOM, never mutate inputs)

```js
// importers.js
buildGuestsFromRows({ ticketRows, mealRows, overrideRows }) -> { guests: Guest[], report }
//   rows are arrays-of-arrays WITH the header row (SheetJS sheet_to_json({header:1})). Any may be null.
//   report: { tickets, dinnerTickets, responses, attributed, unattributed, placeholders, duplicates, notes: string[] }
mergeGuestsIntoPlan(plan, guests) -> { plan, summary: { added, updated, kept, missing: Guest[] } }
//   Re-import keeps every existing seat, tag, plannerNote and manual edit. Guests that vanished from the
//   source are NOT deleted; they are returned in `missing` so the planner decides.

// preferences.js
resolvePreferences(guests) -> Guest[]            // returns new guests with `prefs` filled in

// warnings.js
computeWarnings(plan) -> Warning[]               // excludes nothing; the UI hides plan.dismissed keys
previewPlacement(plan, guestId, tableId) -> Warning[]   // warnings this placement WOULD create (for drag hover)
indexWarnings(warnings) -> { byGuest: {id: Warning[]}, byTable: {id: Warning[]}, counts:{error,warn,info}, all }

// autoseat.js
autoSeat(plan, { onlyUnseated = true, respectLocked = true, includeLateNight = false }) -> { plan, placed, skipped: [{guestId, reason}] }

// exporters.js
serializePlan(plan) -> string                    // wraps the plan: { app:"lsp-gala-seating", schema, exportedAt, plan }
parsePlanFile(text) -> { plan|null, errors: string[] }   // validates, migrates, repairs dangling seats
seatingCsv(plan) -> string                       // Table, Seat, Guest, Party, Ticket, Meal, Tags, Notes
mealCounts(plan) -> { total: {mealId|'none': n}, byTable: { tableId: {mealId|'none': n} } }
alphaList(plan) -> [{ name, table, seat, meal }] // sorted by last name, for the check-in desk
tableCards(plan) -> [{ table, guests: [{seat, name, meal, tags, party}], meals: {...} }]
```

## Store API (`store.svelte.js`, Svelte 5 runes)

`createSeatingStore()` returns an object with reactive getters and actions. Every action that
changes the plan pushes an undo entry and **saves to localStorage immediately**.

```js
store.plan            // Plan (reactive)
store.warnings        // indexWarnings(computeWarnings(plan)) minus dismissed
store.savedAt         // Date of last successful save
store.canUndo / store.canRedo
seatGuest(guestId, tableId, seat?)   // seat omitted -> first free seat; occupied seat -> swap
unseatGuest(guestId) ; seatParty(partyId, tableId) ; clearTable(tableId) ; clearAllSeats()
moveTable(id, x, y) ; updateTable(id, patch) ; addTable() ; removeTable(id) ; resetLayout()
moveFixture(id, x, y) ; updateFixture(id, patch) ; addFixture(type) ; removeFixture(id)
updateGuest(id, patch) ; addGuest(partial) ; removeGuest(id)
addConstraint(type, guestIds, note) ; removeConstraint(id)
dismissWarning(key) ; restoreWarning(key)
importGuests(guests, sourceLabel)    // uses mergeGuestsIntoPlan; returns its summary
replacePlan(plan)                    // takes a backup first
runAutoSeat(opts)                    // returns { placed, skipped }
undo() ; redo()
listBackups() -> [{id, at, label, guestCount, seatedCount}] ; restoreBackup(id) ; saveVersion(label)
```

## Component props

```svelte
<ImportDialog {store} open={bool} onclose={fn} />
<ExportMenu {store} />                    <!-- renders its own trigger button + menu -->
<PrintView {store} mode="floor|tables|alpha|kitchen" />   <!-- rendered only while printing -->
```

## Shared live plan, realtime collaboration, and the passcode (SUPERSEDES any earlier sync notes)

There is ONE shared plan, stored in Supabase, that every planner edits at the same time through
this one passcode-protected page. Nobody uploads spreadsheets: the guest data is seeded into
Supabase once by the maintainer. localStorage is only an instant cache and an offline fallback.

**Security model.** A static page cannot keep a secret, so the gate is enforced in Postgres.
Tables have RLS on, zero grants, zero policies; the only way in is `SECURITY DEFINER` RPCs that
check the passcode against a bcrypt hash in a private table. The passcode and hash are never
committed. Failed attempts are logged and throttled. The passcode lives in `sessionStorage`
(or `localStorage` with "remember this device"), never in a URL. Because the tables are not
readable by anon, Supabase `postgres_changes` cannot be used. Realtime uses a **Broadcast**
channel as a doorbell only: payloads carry a version number and a client id, never guest data.

**Ops, not documents.** Every edit is a small op (`ops.js` is the reference implementation;
the plpgsql must mirror it exactly). Last op on a seat or field wins; there are no conflict
dialogs. The store keeps `confirmed` (last server state) and `pending` (unacknowledged ops);
the visible plan is `applyOps(confirmed, pending)`. When the server reports batches from other
planners, the store applies them to `confirmed` and re-derives, so every client converges on
exactly what Postgres holds.

| File | Owner | Purpose |
|---|---|---|
| `ops.js` | shared, frozen | op vocabulary + `applyOp` / `applyOps` |
| `supabase/migrations/*_gala_seating.sql` | backend | tables, RPCs (incl. op application), throttle, snapshots |
| `remote.js` | backend | RPC client + realtime channel (doorbell + presence) |
| `PasscodeGate.svelte`, `SyncBadge.svelte` | backend | gate screen; live status, who is online, version history |

```js
// remote.js
createRemote({ slug = "gala-2026", passcode, clientId, editor }) -> remote
remote.verify()  -> { ok: true } | { ok: false, reason: "bad-passcode" | "locked" | "offline" }
remote.load()    -> { ok, plan: Plan|null, version, updatedAt, updatedBy }
remote.apply(baseVersion, ops) -> { ok: true, version, missed: Batch[] }   // missed = other clients' batches with version > baseVersion, oldest first
                                | { ok: true, version, reset: { plan } }   // log gap or a "replace" happened: adopt this plan, drop pending
                                | { ok: false, reason: "offline" | "locked" | "bad-passcode" | string }
remote.since(version) -> { ok, version, batches: Batch[] } | { ok, version, reset: { plan } }
//   Batch = { version, client, editor, at, ops: Op[] }
remote.subscribe({ onPing(version, client), onPresence(people), onStatus(state) }) -> unsubscribe
//   Broadcast doorbell after every successful apply; presence = [{ client, editor, color, focus }]
remote.setPresence({ focus })        // e.g. { focus: { guestId } | { tableId } | null } so others see who is touching what
remote.history() -> [{ version, at, editor, guestCount, seatedCount, label }]
remote.historyGet(version) -> Plan|null
remote.snapshot(label) -> { ok }     // named server-side version
```

```svelte
<PasscodeGate onunlock={({ remote, editor }) => store.attachRemote(remote, editor)} />
<SyncBadge {store} />
```

Store (UI agent) additions and changes:

```js
store.attachRemote(remote, editor)   // load; the SERVER plan wins. Local cache is only used when the server is unreachable.
store.sync     // { status: "locked"|"loading"|"live"|"saving"|"offline"|"error", version, updatedAt, updatedBy, pending: n, error }
store.people   // presence list for avatars and "Ana is moving Table 4" hints
store.remote   // the attached remote (SyncBadge uses it)
store.loadRemoteVersion(version)     // restore = a "replace" op, after a local backup
```
Every store action: (1) builds ops, (2) applies them locally at once, (3) writes localStorage
at once, (4) queues them and flushes to `remote.apply` within ~120 ms (batch what accumulated;
one in-flight request at a time; retry with backoff when offline, keeping `pending`).
On a doorbell ping with a newer version, or every 10 s as a fallback, call `remote.since`.
Table/fixture drags send `item_patch` once on drop (not per pointermove), plus presence `focus`
while dragging. Undo/redo emit inverse ops like any other edit, so they are safe while others
are editing. Whole-plan changes (seeding, restore, "reshuffle everyone" auto-seat) use `replace`.
There is NO conflict dialog and no `resolveConflict`.

**Guest data entry point.** The welcome/empty state must NOT ask planners to import files: after
unlocking, the shared plan simply loads. `ImportDialog` stays, but only under an "Admin" section
of the export menu as "Update guest data from spreadsheets" (it emits `guest_put` ops via
`store.importGuests`). "Load demo guests" is available only in local mode (`?local=1`).
