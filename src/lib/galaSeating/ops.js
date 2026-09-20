// Operations: the unit of change for realtime collaboration.
//
// Every edit is expressed as a small op. The client applies ops optimistically, sends them
// to Postgres, and Postgres applies the SAME semantics to the shared plan under a row lock
// (see gala_seating_apply in the migration). Because both sides apply identical rules, two
// planners can work at once without "conflict" dialogs: the last op on a given seat or
// field wins, and nothing else is touched.
//
// This file is the reference implementation. The plpgsql in the migration must mirror it.
//
//   { op: "seat", g, t, s }            seat guest g at table t seat s; whoever sat there is unseated
//   { op: "unseat", g }
//   { op: "clear_seats", t? }          one table, or every table when t is omitted
//   { op: "guest_put", guest }         insert or replace a whole guest
//   { op: "guest_patch", g, patch }    shallow merge; ignored when g is unknown
//   { op: "guest_del", g }             also unseats and strips g from constraints
//   { op: "item_put", coll, item }     coll: "tables" | "fixtures" | "constraints"; replace by id or append
//   { op: "item_patch", coll, id, patch }
//   { op: "item_del", coll, id }       deleting a table unseats everyone at it
//   { op: "meta_patch", patch }
//   { op: "dismiss", key, on }         on=true dismisses a warning key, on=false restores it
//   { op: "replace", plan }            whole-plan swap (seeding, restore, auto-seat of everyone)

const COLLS = new Set(["tables", "fixtures", "constraints"]);

export function applyOps(plan, ops) {
  let p = plan;
  for (const op of ops || []) p = applyOp(p, op);
  return p;
}

export function applyOp(plan, op) {
  if (!op || typeof op !== "object") return plan;
  switch (op.op) {
    case "seat": {
      const table = plan.tables.find((t) => t.id === op.t);
      const seat = Number(op.s);
      if (!table || !plan.guests[op.g] || !Number.isInteger(seat) || seat < 0 || seat >= table.seats) return plan;
      const seating = {};
      for (const [id, s] of Object.entries(plan.seating)) {
        if (id === op.g) continue;
        if (s.tableId === op.t && s.seat === seat) continue; // evicted: becomes unseated
        seating[id] = s;
      }
      seating[op.g] = { tableId: op.t, seat };
      return { ...plan, seating };
    }
    case "unseat": {
      if (!plan.seating[op.g]) return plan;
      const seating = { ...plan.seating };
      delete seating[op.g];
      return { ...plan, seating };
    }
    case "clear_seats": {
      if (!op.t) return { ...plan, seating: {} };
      const seating = {};
      for (const [id, s] of Object.entries(plan.seating)) if (s.tableId !== op.t) seating[id] = s;
      return { ...plan, seating };
    }
    case "guest_put": {
      if (!op.guest || !op.guest.id) return plan;
      return { ...plan, guests: { ...plan.guests, [op.guest.id]: op.guest } };
    }
    case "guest_patch": {
      const g = plan.guests[op.g];
      if (!g || !op.patch) return plan;
      return { ...plan, guests: { ...plan.guests, [op.g]: { ...g, ...op.patch, id: g.id } } };
    }
    case "guest_del": {
      if (!plan.guests[op.g]) return plan;
      const guests = { ...plan.guests };
      delete guests[op.g];
      const seating = { ...plan.seating };
      delete seating[op.g];
      const constraints = plan.constraints
        .map((c) => ({ ...c, guestIds: c.guestIds.filter((id) => id !== op.g) }))
        .filter((c) => c.guestIds.length >= 2);
      return { ...plan, guests, seating, constraints };
    }
    case "item_put": {
      if (!COLLS.has(op.coll) || !op.item || !op.item.id) return plan;
      const list = plan[op.coll];
      const i = list.findIndex((x) => x.id === op.item.id);
      const next = i === -1 ? [...list, op.item] : list.map((x, k) => (k === i ? op.item : x));
      return { ...plan, [op.coll]: next };
    }
    case "item_patch": {
      if (!COLLS.has(op.coll) || !op.patch) return plan;
      if (!plan[op.coll].some((x) => x.id === op.id)) return plan;
      return { ...plan, [op.coll]: plan[op.coll].map((x) => (x.id === op.id ? { ...x, ...op.patch, id: x.id } : x)) };
    }
    case "item_del": {
      if (!COLLS.has(op.coll)) return plan;
      const next = { ...plan, [op.coll]: plan[op.coll].filter((x) => x.id !== op.id) };
      if (op.coll === "tables") {
        const seating = {};
        for (const [id, s] of Object.entries(plan.seating)) if (s.tableId !== op.id) seating[id] = s;
        next.seating = seating;
      }
      return next;
    }
    case "meta_patch":
      return op.patch ? { ...plan, meta: { ...plan.meta, ...op.patch } } : plan;
    case "dismiss": {
      if (!op.key) return plan;
      const dismissed = { ...plan.dismissed };
      if (op.on === false) delete dismissed[op.key];
      else dismissed[op.key] = true;
      return { ...plan, dismissed };
    }
    case "replace":
      return op.plan && typeof op.plan === "object" ? op.plan : plan;
    default:
      return plan;
  }
}
