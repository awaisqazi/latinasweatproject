<script>
  // /gala/control: the run of show from a phone. Next / Back walk the program
  // segments on the big screen (and every guest phone that mirrors it), honors
  // reveal one tap at a time, and the scene, calling level, goal and fx kill
  // switch are one tap away.
  //
  // Auth: the ADMIN passcode for the event, exchanged once through
  // gala_checkin_unlock for an 18 h admin session (the passcode itself is never
  // stored; only the session token is, and only on this device). A door
  // passcode opens a door session, which gala_display_set refuses, so this page
  // says so and signs straight back out.
  //
  // Flaky venue wifi: the screen shows the LAST CONFIRMED state from the server
  // (polled every 4 s) and, on top of it, what you just asked for, marked
  // "Sending". Writes go out one at a time, newest intent wins, and a failed
  // send is retried with the same op id (gala_display_set is idempotent on it).
  import { onMount, onDestroy } from "svelte";
  import { supabase } from "../../../lib/supabaseClient.js";
  import { createCheckinRemote, newOpId, DEFAULT_EVENT } from "../../../lib/galaCheckin/remote.js";
  import { createCheckinStore } from "../../../lib/galaCheckin/store.svelte.js";
  import { createTerminalStore } from "../../../lib/galaTerminal/store.svelte.js";
  import GiftPanel from "./GiftPanel.svelte";
  import {
    SEGMENTS, HONOREES, HONOR_STEPS, segmentById, normalizePos, nextPos, prevPos, patchFor, sceneFor,
    honorAt, honorStepOf, resolveHonoree, statusLine, stepLabel, voiceAt, safeImageUrl, REMARKS,
  } from "../../../lib/galaLive/program.js";
  import { money, levelMoney, normalizeLevels } from "../../../lib/galaLive/config.js";

  // Standalone (/gala/control) this page owns its gate, session and stores.
  // Embedded in /gala/admin the host passes its already-unlocked admin remote
  // and the shared check-in + terminal stores, and `onLock` for sign-out or a
  // dead session.
  let {
    remote: injectedRemote = null, checkin: injectedCheckin = null, terminal: injectedTerminal = null,
    onLock = null,
  } = $props();
  const embedded = !!injectedRemote;

  const POLL_MS = 4000;
  const SESSION_DEAD = new Set(["bad-session", "expired", "revoked", "closed", "forbidden"]);

  function pickEvent() {
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const v = new URLSearchParams(window.location.search).get("event") || "";
      if (/^[a-z0-9][a-z0-9-]{0,79}$/.test(v)) return v;
    }
    return DEFAULT_EVENT;
  }
  const event = injectedRemote?.event || pickEvent();
  const remote = injectedRemote || createCheckinRemote({ event });

  // The gift panel writes through the pledge terminal's store, so a gift keyed
  // here is exactly a terminal entry. Scope "control": its own outbox slot.
  const checkin = injectedCheckin || createCheckinStore();
  const terminal = injectedTerminal || createTerminalStore({ scope: "control" });
  let giftsAttached = !!injectedTerminal;
  async function attachGifts() {
    if (giftsAttached) return;
    giftsAttached = true;
    const res = await checkin.attach(remote);
    if (!res?.ok && !res?.transient) {
      giftsAttached = false;
      return;
    }
    await terminal.attach({ checkin, remote });
  }
  $effect(() => {
    if (phase === "ready" && !embedded) void attachGifts();
  });
  onDestroy(() => {
    if (embedded) return;
    terminal.stop();
    checkin.stop();
  });
  let giftOpen = $state(false);

  /* ---------------- gate ---------------- */
  let phase = $state(injectedRemote ? "ready" : "checking"); // checking | gate | ready
  let pass = $state("");
  let who = $state("");
  let remember = $state(true);
  let gateBusy = $state(false);
  let gateError = $state("");

  const GATE_TEXT = {
    "bad-passcode": "That passcode did not work.",
    locked: "Too many tries from this network. Wait ten minutes, or use the ops console.",
    "missing-name": "Add your first name.",
    closed: "This event is closed.",
    offline: "No connection. Try again.",
  };

  async function unlock(e) {
    e?.preventDefault();
    if (gateBusy) return;
    gateError = "";
    if (!pass.trim()) return (gateError = "Enter the admin passcode.");
    if (!who.trim()) return (gateError = GATE_TEXT["missing-name"]);
    gateBusy = true;
    const res = await remote.unlock({ passcode: pass.trim(), name: who.trim(), device: "show-control", persist: remember });
    gateBusy = false;
    pass = "";
    if (!res.ok) return (gateError = GATE_TEXT[res.reason] || `Could not unlock (${res.reason || "error"}).`);
    if (res.role !== "admin") {
      await remote.logout();
      gateError = "That passcode opens the door desk. The show control needs the admin passcode.";
      return;
    }
    phase = "ready";
    poll();
  }

  async function signOut() {
    if (embedded) return onLock?.("signout");
    await remote.logout();
    phase = "gate";
  }

  /* ---------------- confirmed state (poll) ---------------- */
  let confirmed = $state.raw(null);
  let lastOkAt = $state(0);
  let now = $state(Date.now());
  let confirmedVersion = 0;

  async function poll() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc("gala_display_public", { p_event: event });
      if (error || !data) return;
      lastOkAt = Date.now();
      // A poll that left before our last confirmed write can land after it:
      // never step backwards.
      if (Number(data.version) >= confirmedVersion) {
        confirmed = data;
        confirmedVersion = Number(data.version) || 0;
      }
    } catch {
      /* offline: keep the last confirmed picture */
    }
  }

  /* ---------------- the send queue ---------------- */
  let desired = $state.raw(null); // merged patch not yet sent
  let inflight = $state.raw(null); // { opId, patch }
  let sendError = $state("");
  let retryIn = $state(0);

  function mergePatch(a, b) {
    if (!a) return b ? structuredClone(b) : null;
    if (!b) return a;
    const out = { ...a, ...b };
    if (a.program || b.program) {
      out.program = { ...(a.program || {}), ...(b.program || {}) };
      if (a.program?.honoree_overrides || b.program?.honoree_overrides) {
        out.program.honoree_overrides = { ...(a.program?.honoree_overrides || {}), ...(b.program?.honoree_overrides || {}) };
      }
    }
    return out;
  }

  function want(patch) {
    sendError = "";
    desired = mergePatch(desired, patch);
    pump();
  }

  let pumping = false;
  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (desired || inflight) {
        if (!inflight) {
          inflight = { opId: newOpId(), patch: desired };
          desired = null;
        }
        const res = await remote.displaySet(inflight.opId, inflight.patch);
        if (res?.ok) {
          if (res.state) {
            confirmed = res.state;
            confirmedVersion = Math.max(confirmedVersion, Number(res.state.version) || 0);
            lastOkAt = Date.now();
          }
          inflight = null;
          retryIn = 0;
          continue;
        }
        if (SESSION_DEAD.has(res?.reason)) {
          inflight = null;
          desired = null;
          gateError = res.reason === "forbidden" ? "This session cannot change the screen. Unlock with the admin passcode." : "Your session ended. Unlock again.";
          if (embedded) {
            onLock?.(res.reason);
            return;
          }
          phase = "gate";
          return;
        }
        if (res?.transient) {
          // Same op id on retry; anything newer is folded on top and sent next.
          if (desired) {
            inflight = { opId: newOpId(), patch: mergePatch(inflight.patch, desired) };
            desired = null;
          }
          retryIn = 2;
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        sendError = res?.reason === "invalid-patch"
          ? `That value was refused (${res.field || "field"}${res.detail ? `: ${res.detail}` : ""}).`
          : `That did not save (${res?.reason || "unknown"}).`;
        inflight = null;
      }
    } finally {
      pumping = false;
    }
  }

  /* ---------------- the optimistic view ---------------- */
  const pendingPatch = $derived(mergePatch(inflight?.patch ? structuredClone(inflight.patch) : null, desired));
  const sending = $derived(!!(inflight || desired));

  const view = $derived.by(() => {
    const c = confirmed || {};
    const p = pendingPatch || {};
    const program = { ...(c.program || {}), ...(p.program || {}) };
    program.honoree_overrides = { ...(c.program?.honoree_overrides || {}), ...(p.program?.honoree_overrides || {}) };
    return {
      live: c.live === true,
      scene: p.scene ?? c.scene ?? "ambient",
      fx: p.fx_mode ?? c.fx_mode ?? "full",
      level: "current_level_cents" in p ? p.current_level_cents : c.current_level_cents ?? null,
      goal: p.goal_cents ?? c.goal_cents ?? 0,
      levels: normalizeLevels(c.levels),
      total: Number(c.total_cents) || 0,
      program,
    };
  });

  const pos = $derived(normalizePos(view.program));
  // Paddle raise on screen: calling levels and the gift panel move to the top.
  const raiseFirst = $derived(view.scene === "appeal" || view.scene === "auction");
  const seg = $derived(segmentById(pos.seg));
  const roomPos = $derived(normalizePos(confirmed?.program));
  const roomScene = $derived(confirmed?.scene || "ambient");
  const offScene = $derived(view.scene !== sceneFor(pos.seg)); // an override is up

  const online = $derived(lastOkAt > 0 && now - lastOkAt < POLL_MS * 3 + 2000);

  function describe(p, scene, program) {
    if (scene === "blackout") return "Blackout: the screen is dark";
    if (scene === "ambient") return "Ambient: the live total, no program";
    if (scene === "appeal" || scene === "auction") return "Paddle raise: total, thermometer, calling level";
    if (scene === "thanks" || scene === "finale") return "Gracias, comunidad, with the total and sponsors";
    const s = segmentById(p.seg);
    if (s.id === "honors") {
      const at = honorAt(p.step);
      if (at.kind === "remarks") return `Remarks: ${REMARKS.name}`;
      const h = resolveHonoree(HONOREES[at.index], program?.honoree_overrides);
      return at.revealed ? `${h.title}: ${h.name}, photo and burst` : `${h.title}: title and description, name hidden`;
    }
    if (s.id === "voices") {
      const v = voiceAt(p.step);
      return v ? `Featured Voice: ${v.name}` : "Featured Voices: all five";
    }
    if (s.id === "seating") return "Find your table: boards cycle every 10 s";
    return s.title;
  }

  function nextLabel(p) {
    const n = nextPos(p);
    if (n.seg === p.seg && n.step === p.step) return "End of the program";
    const s = segmentById(n.seg);
    if (s.id === "honors") {
      const at = honorAt(n.step);
      if (at.kind === "remarks") return `Remarks · ${REMARKS.name}`;
      const h = resolveHonoree(HONOREES[at.index], view.program.honoree_overrides);
      return at.revealed ? `Reveal ${h.name}` : `${h.title} (name hidden)`;
    }
    if (s.id === "voices") {
      const v = voiceAt(n.step);
      return v ? `Voice · ${v.name}` : "Featured Voices";
    }
    return s.title;
  }

  /* ---------------- actions ---------------- */
  const go = (p) => want(patchFor(p));
  const next = () => go(nextPos(pos));
  const back = () => go(prevPos(pos));
  const jump = (id) => go({ seg: id, step: 0 });
  const home = () => go({ seg: "seating", step: 0 });
  // Resume = put the scene back to the one the current segment runs in.
  const resume = () => want({ scene: sceneFor(pos.seg) });

  let blackoutArm = $state(false);
  function setScene(scene) {
    if (scene === "blackout" && view.scene !== "blackout" && !blackoutArm) {
      blackoutArm = true;
      setTimeout(() => (blackoutArm = false), 4000);
      return;
    }
    blackoutArm = false;
    want({ scene });
  }

  function toggleReveal(i) {
    const at = pos.seg === "honors" ? honorAt(pos.step) : null;
    const revealedNow = at?.kind === "honor" && at.index === i && at.revealed;
    go({ seg: "honors", step: honorStepOf(i, !revealedNow) });
  }
  const showTitle = (i) => go({ seg: "honors", step: honorStepOf(i, false) });

  // Per-honoree runtime fixes.
  let ovOpen = $state("");
  let ovPhoto = $state("");
  let ovName = $state("");
  let ovError = $state("");
  function openOverride(h) {
    if (ovOpen === h.slug) return (ovOpen = "");
    ovOpen = h.slug;
    const o = view.program.honoree_overrides?.[h.slug] || {};
    ovPhoto = o.photo_url || "";
    ovName = o.name || "";
    ovError = "";
  }
  function saveOverride(slug) {
    const photo = ovPhoto.trim();
    if (photo && !safeImageUrl(photo)) return (ovError = "Use a full https:// image link.");
    ovError = "";
    want({ program: { honoree_overrides: { [slug]: photo || ovName.trim() ? { photo_url: photo, name: ovName.trim() } : null } } });
    ovOpen = "";
  }
  function clearOverride(slug) {
    want({ program: { honoree_overrides: { [slug]: null } } });
    ovOpen = "";
  }

  let goalDraft = $state("");
  function saveGoal() {
    const n = Math.round(Number(String(goalDraft).replace(/[$,\s]/g, "")) * 100);
    if (!Number.isFinite(n) || n < 0) return (sendError = "Goal must be a dollar amount.");
    want({ goal_cents: n });
    goalDraft = "";
  }

  onMount(() => {
    let alive = true;
    if (embedded) poll();
    else (async () => {
      // A remembered session: prove it is an admin one without changing
      // anything (an empty patch answers "nothing-to-change" only after auth).
      const res = await remote.displaySet(newOpId(), {});
      if (!alive) return;
      phase = res?.reason === "nothing-to-change" ? "ready" : "gate";
      if (phase === "ready") poll();
      else if (res?.transient) gateError = "No connection yet. You can still unlock when it returns.";
    })();
    const t = setInterval(() => {
      now = Date.now();
      if (phase === "ready" && !document.hidden) poll();
    }, POLL_MS);
    const onVis = () => {
      if (!document.hidden && phase === "ready") poll();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  });
</script>

{#snippet raisePanel()}
  <section class="panel">
    <div class="eyebrow">Paddle raise · calling level</div>
    <div class="levels">
      {#each view.levels as l (l.amount_cents)}
        <button class="lvl" class:on={Number(view.level) === Number(l.amount_cents)} onclick={() => want({ current_level_cents: l.amount_cents })}>
          <span class="lamt">{levelMoney(l.amount_cents)}</span>
          {#if l.impact || l.label}<span class="lhint">{l.impact || l.label}</span>{/if}
        </button>
      {/each}
      <button class="lvl any" class:on={view.level == null} onclick={() => want({ current_level_cents: null })}>
        <span class="lamt">Any amount</span>
        <span class="lhint">No level called · ladder and goal</span>
      </button>
    </div>
    {#if !view.levels.length}<p class="muted small">No giving levels are set. Add them in the ops console.</p>{/if}
    <form class="goal" onsubmit={(e) => { e.preventDefault(); saveGoal(); }}>
      <label>
        <span>Goal (now {money(view.goal)})</span>
        <input type="text" inputmode="decimal" bind:value={goalDraft} placeholder="75000" />
      </label>
      <button class="btn small" type="submit" disabled={!goalDraft}>Set goal</button>
    </form>
  </section>
{/snippet}

<div class="gc" class:embedded>
  {#if phase === "checking"}
    <div class="center"><p class="muted">Checking this device…</p></div>
  {:else if phase === "gate"}
    <form class="gate" onsubmit={unlock}>
      <div class="eyebrow">Annual Gala</div>
      <h1 class="serif">Show control</h1>
      <p class="muted">Moves the program on the big screen and every guest phone. Admin passcode only.</p>
      <label>
        <span>Admin passcode</span>
        <input type="password" autocomplete="current-password" bind:value={pass} />
      </label>
      <label>
        <span>Your first name</span>
        <input type="text" autocomplete="given-name" maxlength="40" bind:value={who} />
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={remember} />
        <span>Remember this device for tonight (also lets the projector laptop's arrow keys move every phone)</span>
      </label>
      {#if gateError}<p class="err">{gateError}</p>{/if}
      <button class="btn primary" type="submit" disabled={gateBusy}>{gateBusy ? "Unlocking…" : "Unlock"}</button>
      {#if event !== DEFAULT_EVENT}<p class="muted small">Event: {event}</p>{/if}
    </form>
  {:else}
    <header class="bar">
      <div>
        <div class="eyebrow">Show control{event !== DEFAULT_EVENT ? ` · ${event}` : ""}</div>
      </div>
      <div class="pills">
        {#if sending}<span class="pill send">{retryIn ? "Retrying" : "Sending"}</span>{/if}
        <span class="pill" class:ok={online} class:bad={!online}>{online ? "Live" : "Offline"}</span>
      </div>
    </header>

    <section class="now">
      <div class="eyebrow">{seg.time ? `${seg.time} · ` : ""}{offScene ? `Scene: ${view.scene}` : "Program"}</div>
      <div class="serif nowtitle">{seg.title}</div>
      {#if stepLabel(pos)}<div class="step">{stepLabel(pos)}</div>{/if}
      {#if offScene}
        <div class="warn">
          The screen is on <b>{view.scene}</b>, not this segment.
          <button class="link" onclick={resume}>Back to the program</button>
        </div>
      {/if}
    </section>

    <div class="nav">
      <button class="btn back" onclick={back} aria-label="Back one step">Back</button>
      <button class="btn primary next" onclick={next}>
        <span>Next</span>
        <small>{nextLabel(pos)}</small>
      </button>
    </div>

    {#if raiseFirst}
      {@render raisePanel()}
      <GiftPanel {terminal} levels={view.levels} callingCents={view.level} />
    {/if}

    <section class="room">
      <div class="eyebrow">What the room sees now</div>
      <p class="roomline">{confirmed ? describe(roomPos, roomScene, confirmed.program) : "Waiting for the first answer…"}</p>
      {#if confirmed}
        <p class="muted small">Phones: {statusLine(confirmed.program, roomScene) || "dark"}{view.live ? ` · raised ${money(view.total)}` : ""}</p>
      {/if}
      {#if sendError}<p class="err">{sendError}</p>{/if}
    </section>

    {#if pos.seg === "honors"}
      <section class="panel">
        <div class="eyebrow">Honors · tap Reveal when the name is called</div>
        <ul class="honors">
          {#each HONOREES as h0, i (h0.slug)}
            {@const h = resolveHonoree(h0, view.program.honoree_overrides)}
            {@const at = honorAt(pos.step)}
            {@const here = at.kind === "honor" && at.index === i}
            <li class:here>
              <div class="hrow">
                <button class="hname" onclick={() => showTitle(i)}>
                  <span class="ht">{i + 1}. {h.title}</span>
                  <span class="hn">{h.name}{h.photo ? "" : " · monogram"}</span>
                </button>
                <button class="btn small" class:on={here && at.revealed} onclick={() => toggleReveal(i)}>
                  {here && at.revealed ? "Hide" : "Reveal"}
                </button>
              </div>
              <button class="link small" onclick={() => openOverride(h0)}>Photo or name fix</button>
              {#if ovOpen === h0.slug}
                <div class="ov">
                  <label><span>Photo link (https://)</span><input type="url" inputmode="url" bind:value={ovPhoto} placeholder="https://…" /></label>
                  <label><span>Name as shown</span><input type="text" maxlength="80" bind:value={ovName} placeholder={h0.name} /></label>
                  {#if ovError}<p class="err">{ovError}</p>{/if}
                  <div class="row">
                    <button class="btn small primary" onclick={() => saveOverride(h0.slug)}>Save</button>
                    <button class="btn small" onclick={() => clearOverride(h0.slug)}>Use the default</button>
                  </div>
                </div>
              {/if}
            </li>
            {#if i === 3}
              <li class:here={honorAt(pos.step).kind === "remarks"}>
                <div class="hrow">
                  <button class="hname" onclick={() => go({ seg: "honors", step: HONOR_STEPS.findIndex((x) => x.kind === "remarks") })}>
                    <span class="ht">Remarks</span><span class="hn">{REMARKS.name}</span>
                  </button>
                </div>
              </li>
            {/if}
          {/each}
        </ul>
      </section>
    {/if}

    <section class="panel">
      <div class="eyebrow">Jump to a section</div>
      <div class="jumps">
        {#each SEGMENTS as s (s.id)}
          <button class="jump" class:cur={s.id === pos.seg} onclick={() => jump(s.id)}>
            <span>{s.title}</span>{#if s.time}<small>{s.time}</small>{/if}
          </button>
        {/each}
      </div>
      <button class="btn wide" onclick={home}>Back to the seating loop</button>
    </section>

    <section class="panel">
      <div class="eyebrow">Screen override</div>
      <div class="grid4">
        <button class="btn" class:on={view.scene === sceneFor(pos.seg) && !offScene} onclick={resume}>Program</button>
        <button class="btn" class:on={view.scene === "appeal"} onclick={() => setScene("appeal")}>Appeal</button>
        <button class="btn" class:on={view.scene === "thanks"} onclick={() => setScene("thanks")}>Thanks</button>
        <button class="btn danger" class:on={view.scene === "blackout"} onclick={() => setScene("blackout")}>
          {blackoutArm ? "Tap again" : "Blackout"}
        </button>
      </div>
    </section>

    {#if !raiseFirst}
      {@render raisePanel()}
      {#if giftOpen}
        <GiftPanel {terminal} levels={view.levels} callingCents={view.level} />
        <button class="link small" onclick={() => (giftOpen = false)}>Hide the gift panel</button>
      {:else}
        <button class="btn wide gifttoggle" onclick={() => (giftOpen = true)}>Record a gift</button>
      {/if}
    {/if}

    <section class="panel">
      <div class="eyebrow">Effects (kill switch)</div>
      <div class="grid3">
        {#each ["full", "lite", "off"] as f (f)}
          <button class="btn" class:on={view.fx === f} onclick={() => want({ fx_mode: f })}>{f === "off" ? "Off" : f === "lite" ? "Lite" : "Full"}</button>
        {/each}
      </div>
      <p class="muted small">Off = no 3D anywhere. Everything still reads.</p>
    </section>

    <footer class="foot">
      <a class="link" href="/admin/gala#bigscreen">All screen settings (ops console)</a>
      <button class="link" onclick={signOut}>Lock this phone</button>
    </footer>
  {/if}
</div>

<style>
  .gc {
    --ink: #05070c;
    --night: #0b1320;
    --navy: #111a27;
    --navy2: #16212f;
    --navy3: #1b2a40;
    --cream: #fff8ef;
    --warm: #f2e4d2;
    --text: #f3ece1;
    --muted: #c3ccd8;
    --dim: #a9b4c2;
    --gold: #ffbd59;
    --gold-soft: #e4c98a;
    --ok: #5fd4b8;
    --alert: #ff8a7a;
    --serif: "Didot", "Bodoni 72", "Bodoni Moda", "Playfair Display", Georgia, serif;
    --sans: "Avenir Next", "Avenir", "Rubik", "Helvetica Neue", Arial, sans-serif;
    min-height: 100vh;
    min-height: 100dvh;
    background: var(--night);
    color: var(--text);
    font-family: var(--sans);
    padding: max(12px, env(safe-area-inset-top)) 16px calc(28px + env(safe-area-inset-bottom));
    max-width: 560px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    -webkit-tap-highlight-color: transparent;
  }
  * {
    box-sizing: border-box;
  }
  .serif {
    font-family: var(--serif);
    font-style: italic;
    font-weight: 400;
  }
  .eyebrow {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--gold);
  }
  .muted {
    color: var(--dim);
    margin: 0;
    line-height: 1.4;
  }
  .small {
    font-size: 13px;
  }
  .err {
    margin: 0;
    color: var(--alert);
    font-size: 14px;
  }
  .center {
    display: grid;
    place-items: center;
    min-height: 60vh;
  }

  /* gate */
  .gate {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 8vh;
  }
  .gate h1 {
    margin: 0;
    font-size: 40px;
    color: var(--cream);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }
  input[type="password"],
  input[type="text"],
  input[type="url"] {
    min-height: 52px;
    padding: 0 14px;
    border-radius: 3px;
    border: 1px solid rgba(228, 201, 138, 0.3);
    background: var(--navy2);
    color: var(--cream);
    font: 600 17px var(--sans);
  }
  input:focus {
    outline: none;
    border-color: var(--gold);
    box-shadow: 0 0 0 2px var(--night), 0 0 0 4px var(--gold);
  }
  .check {
    flex-direction: row;
    align-items: flex-start;
    gap: 10px;
    font-weight: 500;
  }
  .check input {
    width: 22px;
    height: 22px;
    margin: 0;
    accent-color: var(--gold);
    flex: 0 0 auto;
  }

  /* buttons */
  .btn {
    min-height: 48px;
    padding: 0 14px;
    border-radius: 3px;
    border: 1px solid rgba(255, 189, 89, 0.45);
    background: var(--navy2);
    color: var(--cream);
    font: 700 15px var(--sans);
    cursor: pointer;
  }
  .btn:active {
    background: var(--navy3);
  }
  .btn.on {
    background: var(--gold);
    color: var(--ink);
    border-color: var(--gold);
  }
  .btn.primary {
    background: var(--gold);
    color: var(--ink);
    border-color: var(--gold);
  }
  .btn.danger {
    border-color: rgba(255, 138, 122, 0.6);
  }
  .btn.danger.on {
    background: var(--alert);
    border-color: var(--alert);
  }
  .btn.small {
    min-height: 44px;
    font-size: 14px;
  }
  .btn.wide {
    width: 100%;
    margin-top: 10px;
  }
  .btn:disabled {
    opacity: 0.5;
  }
  .link {
    background: none;
    border: 0;
    padding: 6px 0;
    color: var(--gold);
    font: 700 14px var(--sans);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    text-align: left;
  }

  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .pills {
    display: flex;
    gap: 6px;
  }
  .pill {
    font-size: 12px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .pill.ok {
    color: var(--ink);
    background: var(--ok);
    border-color: var(--ok);
  }
  .pill.bad {
    color: var(--ink);
    background: var(--alert);
    border-color: var(--alert);
  }
  .pill.send {
    color: var(--ink);
    background: var(--gold-soft);
  }

  .now {
    padding: 16px;
    border: 1px solid rgba(255, 189, 89, 0.35);
    border-radius: 6px;
    background: var(--navy);
  }
  .nowtitle {
    margin-top: 4px;
    font-size: 34px;
    line-height: 1.1;
    color: var(--cream);
  }
  .step {
    margin-top: 6px;
    font-size: 16px;
    font-weight: 700;
    color: var(--warm);
  }
  .warn {
    margin-top: 10px;
    padding: 10px 12px;
    border-radius: 3px;
    background: rgba(255, 138, 122, 0.12);
    border: 1px solid rgba(255, 138, 122, 0.45);
    color: var(--cream);
    font-size: 14px;
  }

  .nav {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 10px;
    position: sticky;
    top: 8px;
    z-index: 5;
  }
  .nav .btn {
    min-height: 88px;
    font-size: 20px;
  }
  .next {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
  }
  .next small {
    font-size: 13px;
    font-weight: 700;
    opacity: 0.8;
    max-width: 100%;
    text-align: center;
    line-height: 1.25;
  }

  .room {
    padding: 12px 14px;
    border-radius: 6px;
    background: rgba(255, 248, 239, 0.04);
    border: 1px dashed rgba(228, 201, 138, 0.3);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .roomline {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--cream);
    line-height: 1.35;
  }

  .panel {
    padding: 14px;
    border-radius: 6px;
    background: var(--navy);
    border: 1px solid rgba(228, 201, 138, 0.18);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .honors {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .honors li {
    padding: 8px 10px;
    border-radius: 4px;
    border: 1px solid rgba(228, 201, 138, 0.15);
  }
  .honors li.here {
    border-color: var(--gold);
    background: rgba(255, 189, 89, 0.08);
  }
  .hrow {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .hname {
    flex: 1;
    min-width: 0;
    min-height: 48px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    background: none;
    border: 0;
    color: inherit;
    text-align: left;
    padding: 0;
    cursor: pointer;
  }
  .ht {
    font-size: 14px;
    font-weight: 700;
    color: var(--cream);
  }
  .hn {
    font-size: 13px;
    color: var(--muted);
  }
  .ov {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 6px;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .jumps {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .jump {
    min-height: 52px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    padding: 6px 10px;
    border-radius: 3px;
    border: 1px solid rgba(228, 201, 138, 0.22);
    background: var(--navy2);
    color: var(--cream);
    font: 700 14px var(--sans);
    text-align: left;
    cursor: pointer;
  }
  .jump small {
    font-size: 12px;
    color: var(--gold-soft);
    font-weight: 700;
  }
  .jump.cur {
    border-color: var(--gold);
    background: rgba(255, 189, 89, 0.14);
  }
  .grid4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .grid4 .btn {
    padding: 0 4px;
    font-size: 14px;
  }
  .grid3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .levels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .lvl {
    min-height: 60px;
    padding: 8px 10px;
    border-radius: 3px;
    border: 1px solid rgba(255, 189, 89, 0.45);
    background: var(--navy2);
    color: var(--cream);
    text-align: left;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    cursor: pointer;
    min-width: 0;
  }
  .lvl .lamt {
    font: 800 17px var(--sans);
    font-variant-numeric: tabular-nums;
  }
  .lvl .lhint {
    font: 500 12px/1.3 var(--sans);
    color: var(--dim);
    overflow-wrap: anywhere;
  }
  .lvl.on {
    background: var(--gold);
    border-color: var(--gold);
    color: var(--ink);
  }
  .lvl.on .lhint {
    color: rgba(5, 7, 12, 0.78);
  }
  .gifttoggle {
    margin-top: 0;
  }
  .gc.embedded {
    min-height: 0;
  }
  .goal {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }
  .goal label {
    flex: 1;
  }
  .foot {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding-top: 4px;
  }
</style>
