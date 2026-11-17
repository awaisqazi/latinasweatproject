// Giving Tuesday thank-you drawing: pure helpers, no Supabase, so the logic
// can be proven under Node with a fixed random source.
//
// The pool is every APPROVED fundraiser whose eligible total (gifts from other
// people, on time, not flagged) reaches the campaign threshold. One winner is
// picked uniformly: 32-bit draws from getRandomValues with rejection sampling,
// so no index is favoured by modulo bias. Every random byte used is kept and
// stored as hex next to the snapshot, so the result can be re-derived later.

const U32_RANGE = 2 ** 32;

// Rows from giving_fundraiser_totals -> the frozen pool, ordered by
// fundraiser id so the snapshot (and the index the seed maps to) never
// depends on how the caller happened to sort the list.
export function buildEligibleSnapshot(totals) {
  return (totals || [])
    .filter((row) => row && row.status === "approved" && row.reached === true)
    .map((row) => ({
      fundraiser_id: String(row.fundraiser_id),
      name: String(row.display_name || ""),
      eligible_cents: Number(row.eligible_cents || 0),
    }))
    .sort((a, b) => (a.fundraiser_id < b.fundraiser_id ? -1 : a.fundraiser_id > b.fundraiser_id ? 1 : 0));
}

function toHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readU32(bytes) {
  // Big-endian, unsigned.
  return ((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
}

// Uniform integer in [0, n). getRandomValues(typedArray) fills the array in
// place, exactly like crypto.getRandomValues. Returns the index plus every
// byte consumed (rejected draws included).
export function uniformIndex(n, getRandomValues) {
  if (!Number.isInteger(n) || n < 1 || n > U32_RANGE) {
    throw new Error("Pool size must be a whole number from 1 to 2^32.");
  }
  if (typeof getRandomValues !== "function") {
    throw new Error("A random source is required.");
  }
  // Largest multiple of n that fits in 32 bits: values at or above it are
  // thrown away, so every index keeps exactly floor(2^32 / n) values.
  const limit = U32_RANGE - (U32_RANGE % n);
  const used = [];
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const bytes = new Uint8Array(4);
    getRandomValues(bytes);
    used.push(...bytes);
    const value = readU32(bytes);
    if (value < limit) return { index: value % n, bytes: used };
  }
  // Each attempt is rejected with probability < 1/2, so this is unreachable
  // with a working random source.
  throw new Error("The random source kept returning rejected values.");
}

// Re-derive the winner index from a stored seed (the same rejection rule).
export function indexFromSeed(n, seedHex) {
  const bytes = String(seedHex || "").match(/../g)?.map((pair) => parseInt(pair, 16)) || [];
  let offset = 0;
  const replay = (target) => {
    for (let i = 0; i < target.length; i += 1) target[i] = bytes[offset + i];
    offset += target.length;
    if (offset > bytes.length) throw new Error("Seed is too short.");
  };
  return uniformIndex(n, replay).index;
}

// One draw over the snapshot. Returns the row to insert into giving_draws
// (minus who ran it, which the caller adds).
export function runDraw(snapshot, getRandomValues) {
  const pool = Array.isArray(snapshot) ? snapshot : [];
  if (!pool.length) throw new Error("Nobody is in the drawing yet.");
  const { index, bytes } = uniformIndex(pool.length, getRandomValues);
  return {
    eligible: pool,
    seed: toHex(bytes),
    winner_fundraiser_id: pool[index].fundraiser_id,
    winner_index: index,
  };
}
