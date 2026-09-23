// Gala Seating planner · a first pass at the room.
//
// Greedy, deterministic and explainable on purpose. The planner is going to move half of
// it by hand anyway, so the job is to get the right people near the front, keep parties
// and stated preferences on one table, never break a rule the planner set (locked tables,
// keep-apart), and say plainly why each guest ended up where they did. The same plan in
// gives the same plan out, every time.
//
// Prominence comes from the room itself rather than a hard-coded table list: a table is
// "front" when it is close to the dance floor and the podium, so moving the dance floor
// in the UI re-ranks the room with no code change.
//
// Pure ES module: no DOM, no Node APIs, never mutates its inputs.

import { guestList, ticketTypeById, TICKET_TYPES, ROOM } from "./model.js";

/** Sponsor tiers, best seats first. */
const SPONSOR_TIER = { champion: 0, presenting: 1, gold: 2, community: 3 };
const SPONSOR_IDS = new Set(TICKET_TYPES.filter((t) => t.sponsor).map((t) => t.id));
const FRONT_TAGS = ["speaker", "vip"];

/* ------------------------------------------------------------------ *
 * where the good seats are
 * ------------------------------------------------------------------ */

function distance(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

/** Distance from a point to the nearest edge of a fixture's rectangle (0 when inside). */
function rectDistance(px, py, rect) {
  const halfW = Math.abs(Number(rect.w) || 0) / 2;
  const halfH = Math.abs(Number(rect.h) || 0) / 2;
  const dx = Math.max(Math.abs(px - (Number(rect.x) || 0)) - halfW, 0);
  const dy = Math.max(Math.abs(py - (Number(rect.y) || 0)) - halfH, 0);
  return Math.hypot(dx, dy);
}

/**
 * Rank the tables by prominence: distance to the nearest edge of the dance floor plus
 * 0.6 x distance to the podium. Lower is better, rank 1 is the best table in the room.
 * A missing fixture falls back to the distance from the top centre of the room, which is
 * where the stage end of a ballroom normally is. Ties break on table number.
 *
 * @returns {Array<{tableId: string, score: number, rank: number}>}
 */
export function rankTables(plan) {
  const room = (plan && plan.room) || ROOM;
  const fixtures = Array.isArray(plan && plan.fixtures) ? plan.fixtures : [];
  const floor = fixtures.find((f) => f && f.type === "dancefloor");
  const podium = fixtures.find((f) => f && f.type === "podium");
  const topX = (Number(room.width) || ROOM.width) / 2;
  const topY = 0;

  const rows = ((plan && plan.tables) || []).map((t) => {
    const x = Number(t.x) || 0;
    const y = Number(t.y) || 0;
    const floorDist = floor ? rectDistance(x, y, floor) : distance(x, y, topX, topY);
    const podiumDist = podium ? distance(x, y, Number(podium.x) || 0, Number(podium.y) || 0) : distance(x, y, topX, topY);
    return { tableId: t.id, number: Number(t.number) || 0, score: floorDist + 0.6 * podiumDist };
  });

  rows.sort((a, b) => a.score - b.score || a.number - b.number);
  return rows.map((r, i) => ({ tableId: r.tableId, score: r.score, rank: i + 1 }));
}

/* ------------------------------------------------------------------ *
 * seats on the ring
 * ------------------------------------------------------------------ */

/**
 * First start index of `need` free seats in a row around the table, or -1.
 * A run that starts right after an occupied seat is preferred, so a second party lands
 * beside the first instead of cutting the remaining gap in half.
 */
function contiguousRun(taken, seats, need) {
  if (need <= 0 || need > seats - taken.size) return -1;
  const free = (i) => !taken.has(((i % seats) + seats) % seats);
  const fits = (start) => {
    for (let k = 0; k < need; k++) if (!free(start + k)) return false;
    return true;
  };
  for (let s = 0; s < seats; s++) if (fits(s) && !free(s - 1)) return s;
  for (let s = 0; s < seats; s++) if (fits(s)) return s;
  return -1;
}

/* ------------------------------------------------------------------ *
 * clustering
 * ------------------------------------------------------------------ */

class UnionFind {
  constructor() { this.parent = new Map(); }
  add(x) { if (!this.parent.has(x)) this.parent.set(x, x); return x; }
  find(x) {
    this.add(x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root);
    let cur = x;
    while (this.parent.get(cur) !== root) { const next = this.parent.get(cur); this.parent.set(cur, root); cur = next; }
    return root;
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    // Lexicographic root keeps the result independent of insertion order.
    if (ra < rb) this.parent.set(rb, ra); else this.parent.set(ra, rb);
  }
}

function shortGroupLabel(key) {
  if (key === "ytt26") return "YTT '26";
  return `${String(key).charAt(0).toUpperCase()}${String(key).slice(1)}`;
}

/* ------------------------------------------------------------------ *
 * autoSeat
 * ------------------------------------------------------------------ */

/**
 * @param {Object} plan
 * @param {{onlyUnseated?:boolean, respectLocked?:boolean, includeLateNight?:boolean, prioritizeFront?:boolean}} options
 * @returns {{plan:Object, placed:number, skipped:Array<{guestId:string, reason:string}>,
 *            placements:Array<{guestId:string, tableId:string, seat:number, reason:string}>}}
 */
export function autoSeat(plan, options = {}) {
  const {
    onlyUnseated = true,
    respectLocked = true,
    includeLateNight = false,
    prioritizeFront = true,
  } = options;

  const guests = guestList(plan).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byId = new Map(guests.map((g) => [g.id, g]));
  const skipped = [];
  const placements = [];

  const lockedIds = new Set(respectLocked ? plan.tables.filter((t) => t.locked).map((t) => t.id) : []);
  const seating = {};
  for (const [gid, s] of Object.entries(plan.seating || {})) {
    if (!byId.has(gid)) continue;
    if (onlyUnseated || lockedIds.has(s.tableId)) seating[gid] = { ...s };
  }

  // Live occupancy, so capacity can never be exceeded.
  const tables = plan.tables.slice().sort((a, b) => a.number - b.number);
  const byTableId = new Map(tables.map((t) => [t.id, t]));
  const occupied = new Map(tables.map((t) => [t.id, new Set()]));
  const atTable = new Map(tables.map((t) => [t.id, []]));
  for (const [gid, s] of Object.entries(seating)) {
    const set = occupied.get(s.tableId);
    if (!set) continue;
    set.add(s.seat);
    atTable.get(s.tableId).push(gid);
  }
  const freeSeats = (t) => Math.max(0, t.seats - (occupied.get(t.id) ? occupied.get(t.id).size : 0));
  const openTables = () => tables.filter((t) => !lockedIds.has(t.id));

  // Prominence. With prioritizeFront off every table ranks alike and the old
  // affinity-then-tight-fit behaviour is what remains.
  const ranking = rankTables(plan);
  const rankOf = new Map(ranking.map((r) => [r.tableId, r.rank]));
  const rankFor = (t) => (prioritizeFront ? rankOf.get(t.id) || tables.length + 1 : 0);
  const frontCutoff = Math.max(1, Math.ceil(ranking.length / 2));
  const isFront = (tableId) => prioritizeFront && (rankOf.get(tableId) || Infinity) <= frontCutoff;

  // keep-apart pairs
  const avoid = new Map();
  for (const c of plan.constraints || []) {
    if (c.type !== "apart") continue;
    const ids = (c.guestIds || []).filter((id) => byId.has(id));
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      if (!avoid.has(a)) avoid.set(a, new Set());
      avoid.get(a).add(b);
    }
  }
  const conflicts = (member, table, alsoPlacing = []) => {
    const enemies = avoid.get(member.id);
    if (!enemies || !enemies.size) return false;
    for (const id of atTable.get(table.id) || []) if (enemies.has(id)) return true;
    for (const other of alsoPlacing) if (other.id !== member.id && enemies.has(other.id)) return true;
    return false;
  };

  // ---- who needs a seat --------------------------------------------------
  const candidates = [];
  for (const g of guests) {
    if (seating[g.id]) continue;
    if (g.hasDinner === false && !includeLateNight) {
      skipped.push({ guestId: g.id, reason: "Late Night Access ticket, no dinner seat" });
      continue;
    }
    // Nobody has confirmed this seat: the team is reaching out first.
    if ((g.tags || []).includes("outreach")) {
      skipped.push({ guestId: g.id, reason: "needs outreach" });
      continue;
    }
    candidates.push(g);
  }

  // ---- seating a group onto a table --------------------------------------
  const seatGroup = (group, table) => {
    // Order by party before handing out seats, so a cluster that holds two parties gives
    // each of them its own unbroken run instead of interleaving them around the ring.
    const members = group.slice().sort((a, b) =>
      (a.partyId < b.partyId ? -1 : a.partyId > b.partyId ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const taken = occupied.get(table.id);
    const start = contiguousRun(taken, table.seats, members.length);
    const seats = [];
    if (start >= 0) {
      for (let k = 0; k < members.length; k++) seats.push((start + k) % table.seats);
    } else {
      // Not enough room in one run: take whatever is free, still in seat order.
      for (let i = 0; i < table.seats && seats.length < members.length; i++) if (!taken.has(i)) seats.push(i);
    }
    members.forEach((m, i) => {
      const seat = seats[i];
      if (seat === undefined) {
        skipped.push({ guestId: m.id, reason: `${table.name || `Table ${table.number}`} filled up first` });
        return;
      }
      taken.add(seat);
      seating[m.id] = { tableId: table.id, seat };
      atTable.get(table.id).push(m.id);
      placements.push({ guestId: m.id, tableId: table.id, seat });
    });
  };

  // ---- choosing a table --------------------------------------------------
  const groupsOf = (g) => (g.prefs && Array.isArray(g.prefs.groups) ? g.prefs.groups : []);

  /** How strongly this set of guests already belongs at this table. */
  const affinityOf = (members, table, partyOnly) => {
    const here = atTable.get(table.id) || [];
    if (!here.length) return 0;
    const wantedGroups = new Set();
    const wantedParties = new Set();
    const wantedGuests = new Set();
    const wantedPartyRefs = new Set();
    for (const m of members) {
      wantedParties.add(m.partyId);
      for (const k of groupsOf(m)) wantedGroups.add(k);
      for (const id of (m.prefs && m.prefs.withGuestIds) || []) wantedGuests.add(id);
      for (const id of (m.prefs && m.prefs.withPartyIds) || []) wantedPartyRefs.add(id);
    }
    let score = 0;
    for (const id of here) {
      const other = byId.get(id);
      if (!other) continue;
      if (wantedParties.has(other.partyId)) score += 8;
      if (partyOnly) continue;
      if (wantedGuests.has(id)) score += 12;
      if (wantedPartyRefs.has(other.partyId)) score += 10;
      if (groupsOf(other).some((k) => wantedGroups.has(k))) score += 3;
    }
    return score;
  };

  /**
   * Best table with at least `need` free seats.
   * `rankFirst` is the sponsor / VIP rule: prominence decides, and only a table where
   * their own party already sits can outrank it. Otherwise affinity decides first, so a
   * guest who asked to sit with a sponsor's people joins that front table, and rank fills
   * the room from the front backwards whenever affinity is equal (which it usually is).
   */
  const bestTable = (members, need, rankFirst = false) => {
    let best = null;
    for (const t of openTables()) {
      if (freeSeats(t) < need) continue;
      if (members.some((m) => conflicts(m, t, members))) continue;
      const cand = {
        table: t,
        affinity: affinityOf(members, t, rankFirst),
        rank: rankFor(t),
        free: freeSeats(t),
        number: t.number,
      };
      if (!best ||
        cand.affinity > best.affinity ||
        (cand.affinity === best.affinity && cand.rank < best.rank) ||
        (cand.affinity === best.affinity && cand.rank === best.rank && cand.free < best.free) ||
        (cand.affinity === best.affinity && cand.rank === best.rank && cand.free === best.free && cand.number < best.number)
      ) best = cand;
    }
    return best ? best.table : null;
  };

  /** Place a set of guests, splitting along party lines only when it cannot be avoided. */
  const placeMembers = (members, rankFirst = false) => {
    if (!members.length) return;
    const table = bestTable(members, members.length, rankFirst);
    if (table) { seatGroup(members, table); return; }

    const parties = new Map();
    for (const m of members) {
      if (!parties.has(m.partyId)) parties.set(m.partyId, []);
      parties.get(m.partyId).push(m);
    }
    const chunks = [...parties.values()].sort((a, b) => b.length - a.length || (a[0].id < b[0].id ? -1 : 1));
    if (chunks.length > 1) { for (const chunk of chunks) placeMembers(chunk, rankFirst); return; }

    // One party, bigger than anything free: fill the roomiest tables in turn, front first.
    let rest = members.slice();
    while (rest.length) {
      let roomiest = null;
      for (const t of openTables()) {
        const free = freeSeats(t);
        if (free <= 0) continue;
        const slice = rest.slice(0, free);
        if (slice.some((m) => conflicts(m, t, slice))) continue;
        if (!roomiest ||
          free > freeSeats(roomiest) ||
          (free === freeSeats(roomiest) && rankFor(t) < rankFor(roomiest)) ||
          (free === freeSeats(roomiest) && rankFor(t) === rankFor(roomiest) && t.number < roomiest.number)
        ) roomiest = t;
      }
      if (!roomiest) {
        const reason = openTables().length ? "no free seats left at any unlocked table" : "every table is locked";
        for (const m of rest) skipped.push({ guestId: m.id, reason });
        return;
      }
      const take = rest.slice(0, freeSeats(roomiest));
      seatGroup(take, roomiest);
      rest = rest.slice(take.length);
    }
  };

  const unplaced = () => candidates.filter((g) => !seating[g.id]);
  const partiesOf = (list) => {
    const map = new Map();
    for (const g of list) {
      if (!map.has(g.partyId)) map.set(g.partyId, []);
      map.get(g.partyId).push(g);
    }
    return map;
  };

  // ---- 1 · sponsors, best tier first, onto the most prominent table that fits
  const sponsorParties = [...partiesOf(unplaced().filter((g) => SPONSOR_IDS.has(g.ticketType))).entries()]
    .map(([partyId, members]) => ({
      partyId,
      members,
      tier: Math.min(...members.map((m) => (SPONSOR_TIER[m.ticketType] !== undefined ? SPONSOR_TIER[m.ticketType] : 99))),
    }))
    .sort((a, b) => a.tier - b.tier || b.members.length - a.members.length || (a.partyId < b.partyId ? -1 : 1));
  for (const party of sponsorParties) {
    const members = party.members.filter((m) => !seating[m.id]);
    if (members.length) placeMembers(members, true);
  }

  // ---- 2 · the people who are called to the stage or thanked from it
  const vipParties = [...partiesOf(unplaced()).entries()]
    .filter(([, members]) => members.some((m) => (m.tags || []).some((tag) => FRONT_TAGS.includes(tag))))
    .sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
  for (const [, members] of vipParties) {
    const open = members.filter((m) => !seating[m.id]);
    if (open.length) placeMembers(open, true);
  }

  // ---- 3 · everyone else: clusters of party + stated preferences + keep-together
  const uf = new UnionFind();
  for (const g of guests) uf.add(g.id);
  const partyAnchor = new Map();
  for (const g of guests) {
    if (!g.partyId) continue;
    if (!partyAnchor.has(g.partyId)) partyAnchor.set(g.partyId, g.id);
    else uf.union(partyAnchor.get(g.partyId), g.id);
  }
  for (const g of guests) {
    const prefs = g.prefs || {};
    for (const targetId of prefs.withGuestIds || []) if (byId.has(targetId)) uf.union(g.id, targetId);
    for (const partyId of prefs.withPartyIds || []) {
      const anchor = partyAnchor.get(partyId);
      if (anchor) uf.union(g.id, anchor);
    }
  }
  for (const c of plan.constraints || []) {
    if (c.type !== "together") continue;
    const ids = (c.guestIds || []).filter((id) => byId.has(id));
    for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
  }
  // Group keys ("ytt26", "acme") stay a soft pull through affinityOf, never a hard merge:
  // a 19-person cohort must not become one uncuttable block.

  const clusters = new Map();
  for (const g of guests) {
    const root = uf.find(g.id);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(g);
  }
  const clusterOrder = [...clusters.entries()]
    .map(([root, members]) => ({ root, members: members.filter((m) => !seating[m.id] && candidates.includes(m)) }))
    .filter((c) => c.members.length)
    .sort((a, b) => b.members.length - a.members.length || (a.root < b.root ? -1 : 1));

  for (const cluster of clusterOrder) {
    const members = cluster.members.filter((m) => !seating[m.id]);
    if (members.length) placeMembers(members, false);
  }

  // ---- why each guest ended up there -------------------------------------
  // Written once at the end, from the finished room, so the explanation matches what the
  // planner is actually looking at rather than the order things happened in.
  for (const p of placements) {
    const guest = byId.get(p.guestId);
    const table = byTableId.get(p.tableId);
    const front = isFront(p.tableId);
    const where = front ? "front table" : `Table ${table ? table.number : "?"}`;
    const others = (atTable.get(p.tableId) || []).filter((id) => id !== p.guestId).map((id) => byId.get(id)).filter(Boolean);
    const prefs = guest.prefs || {};
    const tags = guest.tags || [];

    let reason;
    if (SPONSOR_IDS.has(guest.ticketType)) {
      reason = `${ticketTypeById(guest.ticketType).short} sponsor, ${where}`;
    } else if (tags.includes("speaker")) {
      reason = front ? "Speaker, near the podium" : `Speaker, ${where}`;
    } else if (tags.includes("vip")) {
      reason = `VIP, ${where}`;
    } else {
      const askedFor = others.find((o) => (prefs.withGuestIds || []).includes(o.id));
      const askedForParty = askedFor ? null : others.find((o) => (prefs.withPartyIds || []).includes(o.partyId));
      const groupMate = askedFor || askedForParty
        ? null
        : others.find((o) => groupsOf(o).some((k) => groupsOf(guest).includes(k)));
      const partyMate = askedFor || askedForParty || groupMate
        ? null
        : others.find((o) => o.partyId === guest.partyId);

      if (askedFor) reason = `asked to sit with ${askedFor.name}`;
      else if (askedForParty) reason = `asked to sit with the tickets ${askedForParty.partyLabel || askedForParty.name} bought`;
      else if (groupMate) {
        const key = groupsOf(guest).find((k) => groupsOf(groupMate).includes(k));
        reason = `${shortGroupLabel(key)} group`;
      } else if (partyMate) reason = `with ${guest.partyLabel || "their party"}'s tickets`;
      else reason = prioritizeFront ? "filled from the front" : "first table with room";
    }
    p.reason = reason;
  }

  placements.sort((a, b) => {
    const ta = byTableId.get(a.tableId);
    const tb = byTableId.get(b.tableId);
    return (ta ? ta.number : 0) - (tb ? tb.number : 0) || a.seat - b.seat;
  });

  return {
    plan: {
      ...plan,
      meta: { ...(plan.meta || {}), updatedAt: new Date().toISOString() },
      seating,
    },
    placed: placements.length,
    skipped,
    placements,
  };
}
