// Shared UI state for the check-in desk. One object, passed through context, so
// a sheet three levels down can ask a question without prop drilling.
//
// Runes mode. Nothing here talks to the network and nothing here decides a
// paddle number: that is the server's job and only the server's.

export function createCheckinUi(store) {
  let query = $state("");
  /** all | waiting | arrived | late */
  let filter = $state("all");
  let openPartyId = $state("");
  let focusGuestId = $state("");
  // Households share a paddle (organizer, Sep 25). A walk-in opened from a
  // party sheet offers to JOIN that household's paddle (`joinGuestId`), and
  // borrows the table number so the volunteer does not retype it.
  let walkIn = $state(null);        // null | { tableNumber, partyLabel, joinGuestId, joinName, joinPaddle }
  let conflict = $state(null);      // { res, title, choices }
  let ask = $state(null);           // { message, confirmLabel, tone, onConfirm }
  let arrival = $state(null);       // null | { ids, rows }: the post check-in card
  let panel = $state("none");       // none | feed | tables
  let searchEl = null;

  return {
    get query() { return query; },
    set query(v) { query = v; },
    get filter() { return filter; },
    set filter(v) { filter = v; },
    get openPartyId() { return openPartyId; },
    get focusGuestId() { return focusGuestId; },
    get walkIn() { return walkIn; },
    get conflict() { return conflict; },
    get ask() { return ask; },
    get arrival() { return arrival; },
    get panel() { return panel; },
    set panel(v) { panel = v; },

    openParty(partyId, guestId = "") {
      openPartyId = partyId;
      focusGuestId = guestId;
      // Presence carries an opaque guest id and a first name. Never party_id:
      // that field is usually an email address.
      store.setFocus(guestId || null);
    },
    closeParty() {
      openPartyId = "";
      focusGuestId = "";
      store.setFocus(null);
    },
    openWalkIn(tableNumber = null, partyLabel = "", join = null) {
      walkIn = {
        tableNumber,
        partyLabel,
        joinGuestId: join?.id || "",
        joinName: join?.name || "",
        joinPaddle: join?.paddle_number ?? null,
      };
    },
    closeWalkIn() { walkIn = null; },
    openConflict(payload) { conflict = payload; },
    closeConflict() { conflict = null; },
    confirm(payload) { ask = payload; },
    closeAsk() { ask = null; },
    /** rows = what the server answered; the card re-reads the live rows by id. */
    showArrival(rows) { arrival = { kind: "arrival", ids: rows.map((g) => g.id), rows }; },
    /** A new number from a split or a lost-paddle swap: same big card, different words. */
    showPaddle({ number, eyebrow, title, line }) { arrival = { kind: "paddle", number, eyebrow, title, line }; },
    closeArrival() { arrival = null; },
    /** After any successful check-in answer (first try or "tap to retry"). */
    afterCheckIn(res) {
      if (!res?.ok) return;
      const newly = new Set(res.newly || []);
      const rows = (res.guests || []).filter((g) => newly.has(g.id));
      if (rows.length) this.showArrival(rows);
    },
    registerSearch(el) { searchEl = el; },
    /** Ready for the next guest: empty search, cursor in it. */
    nextGuest() {
      query = "";
      try { searchEl?.focus({ preventScroll: true }); } catch { /* gone */ }
    },
    closeTop() {
      if (arrival) return void (arrival = null);
      if (ask) return void (ask = null);
      if (conflict) return void (conflict = null);
      if (walkIn) return void (walkIn = null);
      if (openPartyId) return void this.closeParty();
      if (panel !== "none") panel = "none";
    },
  };
}
