<script>
  // /gala/admin, Tools tab: the night-of utilities an organizer needs on a
  // phone. Every action is an EXISTING admin-session RPC:
  //   paddle pool   gala_checkin_pool_init (adds numbers, never removes) and
  //                 gala_checkin_pool_mark (free / held / void, unassigned only)
  //   display key   gala_display_rotate_key (shown once, never stored)
  //   check-in      the numbers the check-in store already derives
  // Assigned paddles are swapped or released from the check-in desk or the ops
  // console; this tab never touches a paddle someone is holding.
  let { remote, checkin, event, onLock = null } = $props();

  const SITE = "https://latinasweatproject.com";
  const DEAD = new Set(["bad-session", "expired", "revoked", "closed"]);
  const REASON = {
    forbidden: "This needs an admin session.",
    "invalid-range": "Use a range like 151 to 160 (at most 2,000 numbers, up to 9999).",
    "invalid-status": "That status is not one the pool knows.",
    offline: "No connection. Try again.",
  };
  const reasonText = (r) => REASON[r] || `That did not go through (${r || "unknown reason"}).`;

  const totals = $derived(checkin?.stats?.totals || {});
  const pad = $derived(checkin?.stats?.paddles || {});

  /* ---------------- paddle pool ---------------- */
  let lo = $state("");
  let hi = $state("");
  let addArm = $state(false);
  let addBusy = $state(false);
  let addMsg = $state("");
  let addErr = $state("");

  const loN = $derived(parseInt(lo, 10));
  const hiN = $derived(parseInt(hi, 10));
  const rangeOk = $derived(Number.isFinite(loN) && Number.isFinite(hiN) && loN >= 1 && hiN >= loN && hiN <= 9999 && hiN - loN <= 2000);

  async function addPaddles() {
    addErr = "";
    addMsg = "";
    if (!rangeOk) return (addErr = REASON["invalid-range"]);
    if (!addArm) {
      addArm = true;
      setTimeout(() => (addArm = false), 5000);
      return;
    }
    addArm = false;
    addBusy = true;
    const res = await remote.poolInit(loN, hiN, []);
    addBusy = false;
    if (!res.ok) {
      if (DEAD.has(res.reason)) return onLock?.(res.reason);
      return (addErr = reasonText(res.reason));
    }
    addMsg = res.added ? `Added ${res.added} paddle${res.added === 1 ? "" : "s"} (${loN} to ${hiN}). Numbers already in the box were left alone.` : `Every number from ${loN} to ${hiN} was already in the box.`;
    lo = "";
    hi = "";
    void checkin.pull();
  }

  let markText = $state("");
  let markBusy = $state(false);
  let markMsg = $state("");
  let markErr = $state("");

  /** "140, 141 150-152" -> [140, 141, 150, 151, 152]. Null when anything is off. */
  function parseNumbers(text) {
    const out = new Set();
    for (const tok of String(text || "").split(/[\s,]+/).filter(Boolean)) {
      const m = /^(\d{1,4})(?:-(\d{1,4}))?$/.exec(tok);
      if (!m) return null;
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      if (!a || b < a || b - a > 200) return null;
      for (let n = a; n <= b; n++) out.add(n);
    }
    return out.size ? [...out] : null;
  }

  async function mark(status) {
    markErr = "";
    markMsg = "";
    const nums = parseNumbers(markText);
    if (!nums) return (markErr = "Type paddle numbers, like 140 or 140, 141 or 150-155.");
    const assigned = nums.filter((n) => checkin.paddles[n]?.status === "assigned");
    const unknown = nums.filter((n) => !checkin.paddles[n]);
    const target = nums.filter((n) => checkin.paddles[n] && checkin.paddles[n].status !== "assigned");
    if (!target.length) {
      return (markErr = assigned.length
        ? `Paddle ${assigned.join(", ")} is held by a guest. Swap or release it at the check-in desk.`
        : `Paddle ${unknown.join(", ")} is not in tonight's box.`);
    }
    markBusy = true;
    const res = await remote.poolMark(target, status);
    markBusy = false;
    if (!res.ok) {
      if (DEAD.has(res.reason)) return onLock?.(res.reason);
      return (markErr = reasonText(res.reason));
    }
    const word = status === "void" ? "marked lost" : status === "held" ? "set aside (held)" : "back in the box";
    const skipped = [...assigned.map((n) => `${n} is held by a guest`), ...unknown.map((n) => `${n} is not in the box`)];
    markMsg = `${res.changed} ${res.changed === 1 ? "paddle" : "paddles"} ${word}.${skipped.length ? ` Skipped: ${skipped.join("; ")}.` : ""}`;
    markText = "";
    void checkin.pull();
  }

  /* ---------------- display key ---------------- */
  let keyArm = $state(false);
  let keyBusy = $state(false);
  let keyErr = $state("");
  let mintedKey = $state("");
  let copied = $state("");

  // The display key alone unlocks names on the projector: gifts AND the
  // "Find your table" board (gala_display_seating_board). No second secret.
  const projectorUrl = $derived(mintedKey ? `${SITE}/gala/live#k=${mintedKey}` : "");

  async function rotate() {
    keyErr = "";
    if (!keyArm) {
      keyArm = true;
      setTimeout(() => (keyArm = false), 5000);
      return;
    }
    keyArm = false;
    keyBusy = true;
    const res = await remote.displayRotateKey();
    keyBusy = false;
    if (res.ok && res.display_key) {
      mintedKey = res.display_key;
      return;
    }
    if (DEAD.has(res.reason)) return onLock?.(res.reason);
    keyErr = reasonText(res.reason);
  }

  async function copy(text, what) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      setTimeout(() => (copied = ""), 2500);
    } catch {
      copied = "";
      keyErr = "Copy did not work on this phone. Press and hold the link to copy it.";
    }
  }

  const LINKS = [
    { href: "/gala/volunteer-checkin", label: "Volunteer check-in", note: "The door desk" },
    { href: "/gala/live", label: "Live screen", note: "Guest view, totals only" },
    { href: "/galaseating", label: "Seating planner", note: "Tables and seats" },
    { href: "/gala/pledges", label: "Pledge terminal (full page)", note: "Door or admin passcode" },
    { href: "/gala/control", label: "Show control (full page)", note: "Same as the Control tab" },
    { href: "/lspgala", label: "Guest hub", note: "What guests see" },
    { href: "/admin/gala", label: "Ops console", note: "Signed-in staff only" },
  ];
</script>

<div class="tools">
  <section class="panel">
    <div class="eyebrow">Check-in</div>
    <div class="tiles">
      <div class="tile big"><b>{totals.checked_in ?? 0}</b><span>arrived of {totals.guests ?? 0}</span></div>
      <div class="tile"><b>{totals.dinner_checked_in ?? 0}<small>{` / ${totals.dinner ?? 0}`}</small></b><span>dinner</span></div>
      <div class="tile"><b>{totals.late_night_checked_in ?? 0}<small>{` / ${totals.late_night ?? 0}`}</small></b><span>late night</span></div>
      <div class="tile"><b>{totals.walkins ?? 0}</b><span>walk-ins</span></div>
      <div class="tile"><b>{totals.parties_arrived ?? 0}<small>{` / ${totals.parties ?? 0}`}</small></b><span>parties</span></div>
    </div>
  </section>

  <section class="panel">
    <div class="eyebrow">Paddle pool</div>
    <div class="tiles">
      <div class="tile big" class:warn={(pad.free ?? 0) < 5}><b>{pad.free ?? 0}</b><span>free in the box</span></div>
      <div class="tile"><b>{pad.assigned ?? 0}</b><span>with guests</span></div>
      <div class="tile"><b>{pad.held ?? 0}</b><span>held back</span></div>
      <div class="tile"><b>{pad.void ?? 0}</b><span>lost or retired</span></div>
      <div class="tile"><b>{pad.arrived_without_paddle ?? 0}</b><span>arrived, no paddle</span></div>
    </div>

    <form class="sub" onsubmit={(e) => { e.preventDefault(); void addPaddles(); }}>
      <div class="lab">Add paddles to the box</div>
      <div class="range">
        <input type="text" inputmode="numeric" autocomplete="off" placeholder="From" aria-label="From paddle" bind:value={lo} oninput={() => (addArm = false)} />
        <span>to</span>
        <input type="text" inputmode="numeric" autocomplete="off" placeholder="To" aria-label="To paddle" bind:value={hi} oninput={() => (addArm = false)} />
      </div>
      <button class="btn" class:arm={addArm} type="submit" disabled={addBusy || !rangeOk}>
        {addBusy ? "Adding…" : addArm ? `Tap again to add ${hiN - loN + 1}` : "Add paddles"}
      </button>
      {#if addErr}<p class="err">{addErr}</p>{/if}
      {#if addMsg}<p class="ok">{addMsg}</p>{/if}
    </form>

    <div class="sub">
      <div class="lab">Mark paddles (unassigned only)</div>
      <input type="text" inputmode="numeric" autocomplete="off" placeholder="140, 141 or 150-155" aria-label="Paddle numbers" bind:value={markText} />
      <div class="grid3">
        <button class="btn" disabled={markBusy || !markText.trim()} onclick={() => mark("void")}>Lost</button>
        <button class="btn" disabled={markBusy || !markText.trim()} onclick={() => mark("held")}>Hold back</button>
        <button class="btn" disabled={markBusy || !markText.trim()} onclick={() => mark("free")}>Back in box</button>
      </div>
      {#if markErr}<p class="err">{markErr}</p>{/if}
      {#if markMsg}<p class="ok">{markMsg}</p>{/if}
      <p class="muted small">A paddle a guest is holding is swapped or released at the check-in desk, never here.</p>
    </div>
  </section>

  <section class="panel">
    <div class="eyebrow">Projector display key</div>
    <p class="muted small">
      The key is shown once and never stored. The link alone unlocks names on the projector: gifts and the
      "Find your table" board. Rotating signs the current projector out: open the new link on the projector laptop.
    </p>
    <button class="btn" class:arm={keyArm} disabled={keyBusy} onclick={rotate}>
      {keyBusy ? "Rotating…" : keyArm ? "Tap again: the projector must reopen the link" : mintedKey ? "Rotate again" : "Rotate and show the key"}
    </button>
    {#if keyErr}<p class="err">{keyErr}</p>{/if}
    {#if mintedKey}
      <div class="keyout">
        <div class="lab">Key</div>
        <code class="code">{mintedKey}</code>
        <button class="btn small" onclick={() => copy(mintedKey, "key")}>{copied === "key" ? "Copied" : "Copy key"}</button>
        <div class="lab">Projector link</div>
        <code class="code">{projectorUrl}</code>
        <button class="btn small primary" onclick={() => copy(projectorUrl, "url")}>{copied === "url" ? "Copied" : "Copy projector link"}</button>
      </div>
    {/if}
  </section>

  <section class="panel">
    <div class="eyebrow">Links</div>
    <ul class="links">
      {#each LINKS as l (l.href)}
        <li><a href={l.href} target="_blank" rel="noopener"><span>{l.label}</span><small>{l.note}</small></a></li>
      {/each}
    </ul>
    {#if event !== "gala-2026"}<p class="muted small">Event: {event}</p>{/if}
  </section>
</div>

<style>
  .tools {
    padding: 14px 16px calc(28px + env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .panel {
    padding: 14px;
    border-radius: var(--g26-r-card, 6px);
    background: var(--g26-navy, #111a27);
    border: 1px solid rgb(228 201 138 / 0.18);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .eyebrow {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--g26-gold, #ffbd59);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .tile {
    padding: 10px 12px;
    border-radius: 4px;
    background: var(--g26-navy-2, #16212f);
    border: 1px solid rgb(228 201 138 / 0.14);
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .tile.big {
    grid-column: span 2;
  }
  .tile b {
    font-size: 26px;
    font-weight: 800;
    color: var(--g26-cream, #fff8ef);
    font-variant-numeric: tabular-nums lining-nums;
    line-height: 1.1;
  }
  .tile.big b {
    font-size: 36px;
    color: var(--g26-gold, #ffbd59);
  }
  .tile.warn b {
    color: var(--g26-alert, #ff8a7a);
  }
  .tile small {
    font-size: 16px;
    color: var(--g26-dim, #a9b4c2);
    font-weight: 700;
  }
  .tile span {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--g26-dim, #a9b4c2);
  }
  .sub {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px dashed rgb(228 201 138 / 0.22);
  }
  .lab {
    font-size: 13px;
    font-weight: 700;
    color: var(--g26-muted, #c3ccd8);
  }
  .range {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    color: var(--g26-dim, #a9b4c2);
    font-weight: 700;
  }
  input {
    width: 100%;
    min-height: 50px;
    padding: 0 12px;
    border-radius: 3px;
    border: 1px solid rgb(228 201 138 / 0.3);
    background: var(--g26-navy-2, #16212f);
    color: var(--g26-cream, #fff8ef);
    font: 600 18px var(--g26-sans, sans-serif);
    font-variant-numeric: tabular-nums;
  }
  input:focus {
    outline: none;
    border-color: var(--g26-gold, #ffbd59);
    box-shadow: var(--g26-focus);
  }
  .grid3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .btn {
    min-height: 52px;
    padding: 0 12px;
    border-radius: 3px;
    border: 1px solid rgb(255 189 89 / 0.45);
    background: var(--g26-navy-2, #16212f);
    color: var(--g26-cream, #fff8ef);
    font: 800 15px var(--g26-sans, sans-serif);
    cursor: pointer;
  }
  .btn.small {
    min-height: 46px;
  }
  .btn.primary {
    background: var(--g26-gold, #ffbd59);
    border-color: var(--g26-gold, #ffbd59);
    color: var(--g26-ink, #05070c);
  }
  .btn.arm {
    background: var(--g26-alert, #ff8a7a);
    border-color: var(--g26-alert, #ff8a7a);
    color: var(--g26-ink, #05070c);
  }
  .btn:disabled {
    opacity: 0.45;
  }
  .keyout {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px dashed rgb(228 201 138 / 0.22);
  }
  .code {
    display: block;
    padding: 10px 12px;
    border-radius: 3px;
    background: var(--g26-ink, #05070c);
    border: 1px solid rgb(228 201 138 / 0.25);
    color: var(--g26-gold-hi, #fff1be);
    font: 600 14px/1.4 ui-monospace, Menlo, monospace;
    overflow-wrap: anywhere;
    user-select: all;
  }
  .muted {
    margin: 0;
    color: var(--g26-dim, #a9b4c2);
    line-height: 1.45;
  }
  .muted b {
    color: var(--g26-cream, #fff8ef);
  }
  .small {
    font-size: 13px;
  }
  .err {
    margin: 0;
    color: var(--g26-alert, #ff8a7a);
    font-size: 14px;
  }
  .ok {
    margin: 0;
    color: var(--g26-ok, #5fd4b8);
    font-size: 14px;
  }
  .links {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .links a {
    min-height: 52px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 8px 12px;
    border-radius: 3px;
    border: 1px solid rgb(228 201 138 / 0.22);
    background: var(--g26-navy-2, #16212f);
    color: var(--g26-cream, #fff8ef);
    text-decoration: none;
    font-weight: 800;
    font-size: 15px;
  }
  .links small {
    font-weight: 500;
    font-size: 12px;
    color: var(--g26-dim, #a9b4c2);
  }
</style>
