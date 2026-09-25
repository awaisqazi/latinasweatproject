<!--
  Big screen: every gala_display_set control, docs/gala-2026/10-display-rpc-
  contract.md section 3. Two independent data flows on purpose:
    - the LIVE PREVIEW polls the anon, tokenless gala_display_public every
      few seconds and is never touched by anything the operator is mid-typing;
    - the CONTROLS are seeded once from the first preview read, then only
      ever overwritten by the state a save actually confirms, so a slow
      network never yanks a field out from under someone editing it.
  Every change carries a fresh op_id (rule: idempotent mutations only replay
  safely when the op_id is not reused for a new intent) and every refusal
  gets a plain-language line, never a thrown error.
-->
<script>
  import { onDestroy } from "svelte";
  import {
    Sun, UtensilsCrossed, Megaphone, Gavel, PartyPopper, Heart, MoonStar,
    RefreshCw, KeyRound, Sparkles, Plus, Trash2, ArrowUp, ArrowDown, Copy, Check, TriangleAlert,
  } from "@lucide/svelte";
  import QRCode from "qrcode";
  import { supabase } from "../../../../lib/supabaseClient.js";
  import { newOpId } from "../../../../lib/galaCheckin/remote.js";
  import { dollars, centsOf, money } from "../../../../lib/galaTerminal/derive.js";
  import { galaTeaser } from "../../../../data/galaTeaser.js";

  let { event, remote, onSessionDead = () => {} } = $props();

  const SCENES = [
    { id: "ambient", label: "Ambient", icon: Sun },
    { id: "program", label: "Program", icon: UtensilsCrossed },
    { id: "appeal", label: "Appeal", icon: Megaphone },
    { id: "auction", label: "Auction", icon: Gavel },
    { id: "finale", label: "Finale", icon: PartyPopper },
    { id: "thanks", label: "Thanks", icon: Heart },
    { id: "blackout", label: "Blackout", icon: MoonStar },
  ];
  const FX_MODES = ["full", "lite", "off"];
  const COUNT_MODES = ["all", "appeal", "manual"];

  const SESSION_DEAD = new Set(["bad-session", "expired", "revoked", "closed"]);
  const REASON_TEXT = {
    forbidden: "Only an admin session can change the big screen.",
    "missing-op-id": "That change was not sent correctly (missing op id). Try again.",
    "invalid-patch": "That value was refused.",
    "nothing-to-change": "Nothing changed.",
  };
  const reasonText = (res) => REASON_TEXT[res?.reason] || (res?.transient ? "No connection. Try again." : `That did not save (${res?.reason || "unknown reason"}).`);

  // ---- live preview (anon, tokenless, independent of the form below) ------
  let publicState = $state.raw(null);
  let previewError = $state("");
  let previewTimer = 0;
  async function pullPublic() {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("gala_display_public", { p_event: event });
    if (error) { previewError = error.message || "Could not read the display state."; return; }
    previewError = "";
    publicState = data;
    if (!seeded && data) seedForm(data);
  }
  pullPublic();
  previewTimer = setInterval(pullPublic, 4000);
  onDestroy(() => clearInterval(previewTimer));

  // ---- the editable form, seeded once ---------------------------------------
  let seeded = false;
  let goalDollars = $state("0");
  let countMode = $state("all");
  let levels = $state.raw([]);           // [{amount_cents, impact_line}]
  let currentLevelCents = $state(null);
  let showNames = $state(true);
  let fxMode = $state("full");
  let publishDelayMs = $state(4000);
  let confirmThresholdDollars = $state("2500");
  let message = $state("");
  let hold = $state(false);
  let matchActive = $state(false);
  let matchLabel = $state("");
  let matchAmountDollars = $state("0");
  let matchUnlockCount = $state("");
  let matchUnlockAmountDollars = $state("0");
  let donateUrl = $state("");
  let sponsors = $state.raw([]);          // [{name, logo_url}]
  let configDraft = $state.raw({});

  function seedForm(s) {
    seeded = true;
    goalDollars = dollars(s.goal_cents).toFixed(2);
    countMode = s.count_mode || "all";
    levels = Array.isArray(s.levels) ? s.levels.map((l) => ({ ...l })) : [];
    currentLevelCents = s.current_level_cents ?? null;
    showNames = Boolean(s.show_names);
    fxMode = s.fx_mode || "full";
    publishDelayMs = Number(s.publish_delay_ms) || 0;
    confirmThresholdDollars = dollars(s.confirm_threshold_cents).toFixed(2);
    message = s.message || "";
    hold = Boolean(s.hold);
    const m = s.match || {};
    matchActive = Boolean(m.active);
    matchLabel = m.label || "";
    matchAmountDollars = dollars(m.amount_cents).toFixed(2);
    matchUnlockCount = m.unlock_at_count != null ? String(m.unlock_at_count) : "";
    matchUnlockAmountDollars = dollars(m.unlock_at_amount_cents).toFixed(2);
    configDraft = { ...(s.config || {}) };
    donateUrl = configDraft.donate_url || galaTeaser.ticketsUrl || "";
    sponsors = Array.isArray(configDraft.sponsors) ? configDraft.sponsors.map((sp) => ({ ...sp })) : [];
  }

  // ---- generic save path ------------------------------------------------
  let busyKeys = $state.raw(new Set());
  let errorsByKey = $state.raw({});
  function setBusy(key, on) {
    const next = new Set(busyKeys);
    if (on) next.add(key); else next.delete(key);
    busyKeys = next;
  }
  function setError(key, text) {
    errorsByKey = { ...errorsByKey, [key]: text };
  }

  async function patch(key, fields) {
    if (!remote) return;
    setBusy(key, true);
    setError(key, "");
    const res = await remote.displaySet(newOpId(), fields);
    setBusy(key, false);
    if (res.ok) {
      if (res.state) { publicState = res.state; }
      return true;
    }
    if (SESSION_DEAD.has(res.reason)) { onSessionDead(); return false; }
    setError(key, reasonText(res));
    return false;
  }

  const setScene = (scene) => patch("scene", { scene });
  const saveGoal = () => patch("goal", { goal_cents: centsOf(goalDollars) });
  const setCountMode = (v) => { countMode = v; patch("count_mode", { count_mode: v }); };
  const saveLevels = () => patch("levels", { levels: levels.map((l) => ({ amount_cents: centsOf(dollars(l.amount_cents)), impact_line: l.impact_line || "" })) });
  const setCurrentLevel = (cents) => { currentLevelCents = cents; patch("current_level", { current_level_cents: cents }); };
  const toggleShowNames = () => { showNames = !showNames; patch("show_names", { show_names: showNames }); };
  const setFxMode = (v) => { fxMode = v; patch("fx_mode", { fx_mode: v }); };
  const savePublishDelay = () => patch("publish_delay", { publish_delay_ms: publishDelayMs });
  const saveConfirmThreshold = () => patch("confirm_threshold", { confirm_threshold_cents: centsOf(confirmThresholdDollars) });
  const saveMessage = () => patch("message", { message: message.slice(0, 300) });
  const toggleHold = () => { hold = !hold; patch("hold", { hold }); };
  const saveMatch = () => patch("match", {
    match: {
      active: matchActive, label: matchLabel.slice(0, 120), amount_cents: centsOf(matchAmountDollars),
      unlock_at_count: matchUnlockCount === "" ? null : Math.max(0, parseInt(matchUnlockCount, 10) || 0),
      unlock_at_amount_cents: centsOf(matchUnlockAmountDollars),
    },
  });
  const saveConfig = () => patch("config", { config: { ...configDraft, donate_url: donateUrl.trim(), sponsors } });

  function addLevel() { levels = [...levels, { amount_cents: 10000, impact_line: "" }]; }
  function removeLevel(i) { levels = levels.filter((_, idx) => idx !== i); }
  function moveLevel(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= levels.length) return;
    const next = levels.slice();
    [next[i], next[j]] = [next[j], next[i]];
    levels = next;
  }
  function addSponsor() { sponsors = [...sponsors, { name: "", logo_url: "" }]; }
  function removeSponsor(i) { sponsors = sponsors.filter((_, idx) => idx !== i); }

  let blackoutConfirm = $state(false);
  function clickScene(id) {
    if (id === "blackout" && publicState?.scene !== "blackout") { blackoutConfirm = true; return; }
    setScene(id);
  }

  // Inline confirms, never window.confirm()/alert(): a native dialog blocks
  // the whole tab (and cannot be driven by most browser automation, which is
  // exactly how this stopped responding during this ticket's own QA pass).
  let reloadConfirm = $state(false);
  async function reloadProjector() {
    if (!reloadConfirm) { reloadConfirm = true; return; }
    reloadConfirm = false;
    await patch("reload", { reload_nonce: crypto.randomUUID() });
  }
  async function testCelebration() {
    await patch("cue", { cue: { type: "supernova" } });
  }

  // ---- display key: generate once, shown once, never stored --------------
  let keyBusy = $state(false);
  let keyError = $state("");
  let mintedKey = $state("");
  let keyCopied = $state(false);
  let rotateConfirm = $state(false);
  const projectorUrl = $derived(mintedKey ? (() => {
    try { return new URL(`/gala/live?event=${encodeURIComponent(event)}#k=${mintedKey}`, window.location.origin).toString(); }
    catch { return `/gala/live?event=${event}#k=${mintedKey}`; }
  })() : "");

  async function rotateKey() {
    if (!remote?.displayRotateKey) return;
    if (!rotateConfirm) { rotateConfirm = true; return; }
    rotateConfirm = false;
    keyBusy = true;
    keyError = "";
    mintedKey = "";
    const res = await remote.displayRotateKey();
    keyBusy = false;
    if (res.ok && res.display_key) { mintedKey = res.display_key; return; }
    if (SESSION_DEAD.has(res.reason)) { onSessionDead(); return; }
    keyError = reasonText(res);
  }
  async function copyProjectorUrl() {
    try { await navigator.clipboard.writeText(projectorUrl); keyCopied = true; setTimeout(() => (keyCopied = false), 1800); } catch { /* fine */ }
  }

  let donateQr = $state("");
  $effect(() => {
    const target = (donateUrl || "").trim();
    if (!target) { donateQr = ""; return; }
    let alive = true;
    QRCode.toDataURL(target, { errorCorrectionLevel: "M", margin: 1, width: 200, color: { dark: "#05070C", light: "#FFF8EF" } })
      .then((d) => { if (alive) donateQr = d; }).catch(() => { if (alive) donateQr = ""; });
    return () => { alive = false; };
  });
</script>

<div class="bs-grid">
  <section class="bs-panel bs-preview">
    <h2 class="bs-h">Live preview (gala_display_public)</h2>
    {#if previewError}
      <p class="bs-err"><TriangleAlert size={14} strokeWidth={2.2} /> {previewError}</p>
    {:else if publicState}
      <dl class="bs-preview-grid">
        <div><dt>Scene</dt><dd>{publicState.scene}</dd></div>
        <div><dt>Total</dt><dd>{money(publicState.total_cents)}</dd></div>
        <div><dt>Goal</dt><dd>{money(publicState.goal_cents)}</dd></div>
        <div><dt>Gifts</dt><dd>{publicState.gift_count}</dd></div>
        <div><dt>Names</dt><dd>{publicState.show_names ? "shown" : "hidden"}</dd></div>
        <div><dt>FX</dt><dd>{publicState.fx_mode}</dd></div>
        <div><dt>Hold</dt><dd>{publicState.hold ? "yes" : "no"}</dd></div>
        <div><dt>Live</dt><dd>{publicState.live ? "yes" : "no"}</dd></div>
      </dl>
    {:else}
      <p class="bs-hint">Loading…</p>
    {/if}
  </section>

  <section class="bs-panel">
    <h2 class="bs-h">Scene</h2>
    <div class="bs-scenes">
      {#each SCENES as s (s.id)}
        <button type="button" class="bs-scene" class:bs-scene--on={publicState?.scene === s.id} onclick={() => clickScene(s.id)} disabled={busyKeys.has("scene")}>
          <s.icon size={18} strokeWidth={2} />
          {s.label}
        </button>
      {/each}
    </div>
    {#if blackoutConfirm}
      <div class="bs-confirm">
        <p>Blackout hides everything on the projector. Are you sure?</p>
        <div class="bs-confirm-row">
          <button type="button" class="bs-btn bs-btn--danger" onclick={() => { blackoutConfirm = false; setScene("blackout"); }}>Yes, blackout</button>
          <button type="button" class="bs-btn bs-btn--ghost" onclick={() => (blackoutConfirm = false)}>Cancel</button>
        </div>
      </div>
    {/if}
    {#if errorsByKey.scene}<p class="bs-err">{errorsByKey.scene}</p>{/if}
  </section>

  <section class="bs-panel">
    <h2 class="bs-h">Goal &amp; counting</h2>
    <label class="bs-field">
      <span>Goal ($)</span>
      <input class="bs-input" type="text" inputmode="decimal" bind:value={goalDollars} />
    </label>
    <label class="bs-field">
      <span>Count mode</span>
      <select class="bs-input" value={countMode} onchange={(e) => setCountMode(e.currentTarget.value)}>
        {#each COUNT_MODES as m (m)}<option value={m}>{m}</option>{/each}
      </select>
    </label>
    <label class="bs-field">
      <span>Confirm threshold ($)</span>
      <input class="bs-input" type="text" inputmode="decimal" bind:value={confirmThresholdDollars} />
    </label>
    <div class="bs-row">
      <button type="button" class="bs-btn" onclick={saveGoal} disabled={busyKeys.has("goal")}>Save goal</button>
      <button type="button" class="bs-btn" onclick={saveConfirmThreshold} disabled={busyKeys.has("confirm_threshold")}>Save threshold</button>
    </div>
    {#if errorsByKey.goal}<p class="bs-err">{errorsByKey.goal}</p>{/if}
    {#if errorsByKey.confirm_threshold}<p class="bs-err">{errorsByKey.confirm_threshold}</p>{/if}
  </section>

  <section class="bs-panel">
    <h2 class="bs-h">Levels &amp; current ask</h2>
    <div class="bs-levels">
      {#each levels as level, i (i)}
        <div class="bs-level-row">
          <input class="bs-input bs-input--sm" type="text" inputmode="decimal" value={dollars(level.amount_cents).toFixed(0)}
            oninput={(e) => { levels = levels.map((l, idx) => idx === i ? { ...l, amount_cents: centsOf(e.currentTarget.value) } : l); }} />
          <input class="bs-input" type="text" placeholder="Impact line" value={level.impact_line}
            oninput={(e) => { levels = levels.map((l, idx) => idx === i ? { ...l, impact_line: e.currentTarget.value.slice(0, 120) } : l); }} />
          <button type="button" class="bs-icon-btn" onclick={() => moveLevel(i, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
          <button type="button" class="bs-icon-btn" onclick={() => moveLevel(i, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
          <button type="button" class="bs-icon-btn" onclick={() => removeLevel(i)} aria-label="Remove level"><Trash2 size={14} /></button>
        </div>
      {/each}
    </div>
    <div class="bs-row">
      <button type="button" class="bs-btn bs-btn--ghost" onclick={addLevel}><Plus size={14} /> Add level</button>
      <button type="button" class="bs-btn" onclick={saveLevels} disabled={busyKeys.has("levels")}>Save levels</button>
    </div>
    {#if errorsByKey.levels}<p class="bs-err">{errorsByKey.levels}</p>{/if}

    <label class="bs-field">
      <span>Current level being called</span>
      <select class="bs-input" value={currentLevelCents ?? ""} onchange={(e) => setCurrentLevel(e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}>
        <option value="">None</option>
        {#each levels as level (level.amount_cents)}<option value={level.amount_cents}>{money(level.amount_cents)}</option>{/each}
      </select>
    </label>
    {#if errorsByKey.current_level}<p class="bs-err">{errorsByKey.current_level}</p>{/if}
  </section>

  <section class="bs-panel">
    <h2 class="bs-h">Display &amp; message</h2>
    <div class="bs-row">
      <button type="button" class="bs-toggle" class:bs-toggle--on={showNames} onclick={toggleShowNames}>Show names: {showNames ? "on" : "off"}</button>
      <button type="button" class="bs-toggle" class:bs-toggle--on={hold} onclick={toggleHold}>Hold: {hold ? "on" : "off"}</button>
    </div>
    <div class="bs-row bs-fx">
      {#each FX_MODES as m (m)}
        <button type="button" class="bs-chip" class:bs-chip--on={fxMode === m} onclick={() => setFxMode(m)}>{m}</button>
      {/each}
    </div>

    <label class="bs-field">
      <span>Undo window before a gift shows: {(publishDelayMs / 1000).toFixed(1)}s</span>
      <input class="bs-slider" type="range" min="0" max="10000" step="500" bind:value={publishDelayMs} onchange={savePublishDelay} />
    </label>
    {#if errorsByKey.publish_delay}<p class="bs-err">{errorsByKey.publish_delay}</p>{/if}

    <label class="bs-field">
      <span>Ticker message ({message.length}/300)</span>
      <textarea class="bs-input bs-textarea" maxlength="300" bind:value={message}></textarea>
    </label>
    <button type="button" class="bs-btn" onclick={saveMessage} disabled={busyKeys.has("message")}>Save message</button>
    {#if errorsByKey.message}<p class="bs-err">{errorsByKey.message}</p>{/if}
  </section>

  <section class="bs-panel">
    <h2 class="bs-h">Match</h2>
    <button type="button" class="bs-toggle" class:bs-toggle--on={matchActive} onclick={() => (matchActive = !matchActive)}>Match active: {matchActive ? "on" : "off"}</button>
    <label class="bs-field"><span>Label</span><input class="bs-input" type="text" maxlength="120" bind:value={matchLabel} /></label>
    <label class="bs-field"><span>Amount ($)</span><input class="bs-input" type="text" inputmode="decimal" bind:value={matchAmountDollars} /></label>
    <label class="bs-field"><span>Unlock at gift count</span><input class="bs-input" type="text" inputmode="numeric" bind:value={matchUnlockCount} /></label>
    <label class="bs-field"><span>Unlock at amount ($)</span><input class="bs-input" type="text" inputmode="decimal" bind:value={matchUnlockAmountDollars} /></label>
    <button type="button" class="bs-btn" onclick={saveMatch} disabled={busyKeys.has("match")}>Save match</button>
    {#if errorsByKey.match}<p class="bs-err">{errorsByKey.match}</p>{/if}
  </section>

  <section class="bs-panel">
    <h2 class="bs-h">Donate link &amp; sponsors</h2>
    <label class="bs-field"><span>config.donate_url</span><input class="bs-input" type="text" bind:value={donateUrl} placeholder={galaTeaser.ticketsUrl} /></label>
    {#if donateQr}<img class="bs-qr" src={donateQr} alt="Donate QR preview" width="120" height="120" />{/if}

    <div class="bs-sponsors">
      {#each sponsors as sponsor, i (i)}
        <div class="bs-level-row">
          <input class="bs-input" type="text" placeholder="Sponsor name" value={sponsor.name}
            oninput={(e) => { sponsors = sponsors.map((s, idx) => idx === i ? { ...s, name: e.currentTarget.value } : s); }} />
          <input class="bs-input" type="text" placeholder="Logo URL" value={sponsor.logo_url}
            oninput={(e) => { sponsors = sponsors.map((s, idx) => idx === i ? { ...s, logo_url: e.currentTarget.value } : s); }} />
          <button type="button" class="bs-icon-btn" onclick={() => removeSponsor(i)} aria-label="Remove sponsor"><Trash2 size={14} /></button>
        </div>
      {/each}
    </div>
    <div class="bs-row">
      <button type="button" class="bs-btn bs-btn--ghost" onclick={addSponsor}><Plus size={14} /> Add sponsor</button>
      <button type="button" class="bs-btn" onclick={saveConfig} disabled={busyKeys.has("config")}>Save donate link &amp; sponsors</button>
    </div>
    {#if errorsByKey.config}<p class="bs-err">{errorsByKey.config}</p>{/if}
  </section>

  <section class="bs-panel">
    <h2 class="bs-h">Cues &amp; projector</h2>
    <div class="bs-row">
      {#if reloadConfirm}
        <span class="bs-inline-confirm">Reload every open projector now?</span>
        <button type="button" class="bs-btn bs-btn--danger" onclick={reloadProjector} disabled={busyKeys.has("reload")}>Yes, reload</button>
        <button type="button" class="bs-btn bs-btn--ghost" onclick={() => (reloadConfirm = false)}>Cancel</button>
      {:else}
        <button type="button" class="bs-btn" onclick={reloadProjector} disabled={busyKeys.has("reload")}><RefreshCw size={14} /> Reload projector</button>
      {/if}
      <button type="button" class="bs-btn bs-btn--ghost" onclick={testCelebration} disabled={busyKeys.has("cue")}><Sparkles size={14} /> Test celebration</button>
    </div>
    <p class="bs-hint">
      "Test celebration" sends a one-shot cue (<code>supernova</code>) through the same channel a real milestone
      uses. Whether the projector plays anything for it depends on the live-display build, which is out of scope
      for this console. It never changes the total.
    </p>
    {#if errorsByKey.reload}<p class="bs-err">{errorsByKey.reload}</p>{/if}
    {#if errorsByKey.cue}<p class="bs-err">{errorsByKey.cue}</p>{/if}
  </section>

  <section class="bs-panel">
    <h2 class="bs-h">Display key</h2>
    <p class="bs-hint">Rotating disconnects the current projector: it must reopen the link with the new key.</p>
    {#if rotateConfirm}
      <p class="bs-inline-confirm">This disconnects the current projector. Continue?</p>
      <div class="bs-row">
        <button type="button" class="bs-btn bs-btn--danger" onclick={rotateKey} disabled={keyBusy}>Yes, rotate</button>
        <button type="button" class="bs-btn bs-btn--ghost" onclick={() => (rotateConfirm = false)}>Cancel</button>
      </div>
    {:else}
      <button type="button" class="bs-btn" onclick={rotateKey} disabled={keyBusy}><KeyRound size={14} /> Generate / rotate key</button>
    {/if}
    {#if keyError}<p class="bs-err">{keyError}</p>{/if}
    {#if projectorUrl}
      <div class="bs-key-out">
        <p class="bs-hint">Shown once. It is not saved anywhere by this console.</p>
        <div class="bs-row">
          <input class="bs-input" type="text" readonly value={projectorUrl} onclick={(e) => e.currentTarget.select()} />
          <button type="button" class="bs-btn" onclick={copyProjectorUrl}>{#if keyCopied}<Check size={14} /> Copied{:else}<Copy size={14} /> Copy{/if}</button>
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .bs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
  .bs-panel { background: var(--g26-surface-1); border: 1px solid var(--g26-line); border-radius: var(--g26-r-card); padding: 14px; }
  .bs-preview { grid-column: 1 / -1; }
  .bs-h { margin: 0 0 10px; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: var(--g26-gold-soft); }
  .bs-hint { margin: 6px 0 0; font-size: 12px; line-height: 1.5; color: var(--g26-dim); }
  .bs-hint code { background: var(--g26-surface-2); padding: 1px 5px; border-radius: 3px; }
  .bs-err { margin: 6px 0 0; font-size: 12px; font-weight: 700; color: var(--g26-alert); display: flex; align-items: center; gap: 5px; }

  .bs-preview-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin: 0; }
  .bs-preview-grid dt { font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--g26-dim); }
  .bs-preview-grid dd { margin: 2px 0 0; font-size: 15px; font-weight: 800; color: var(--g26-cream); font-variant-numeric: tabular-nums; }

  .bs-scenes { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 6px; }
  .bs-scene {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    min-height: 56px; padding: 8px 4px;
    font-size: 11px; font-weight: 800; letter-spacing: 0.02em;
    color: var(--g26-cream); background: var(--g26-surface-2);
    border: 1px solid var(--g26-line); border-radius: var(--g26-r-ctl); cursor: pointer;
  }
  .bs-scene--on { color: var(--g26-ink); background: var(--g26-gold); border-color: var(--g26-gold); }

  .bs-confirm { margin-top: 10px; padding: 10px; background: rgb(255 138 122 / 0.12); border: 1px solid var(--g26-alert); border-radius: var(--g26-r-ctl); }
  .bs-confirm p { margin: 0 0 8px; font-size: 13px; color: var(--g26-cream); }
  .bs-confirm-row { display: flex; gap: 8px; }
  .bs-inline-confirm { font-size: 12px; font-weight: 700; color: var(--g26-alert); }

  .bs-field { display: grid; gap: 4px; margin-bottom: 10px; font-size: 12px; font-weight: 700; color: var(--g26-dim); }
  .bs-input {
    min-height: 40px; padding: 0 10px; font: inherit; font-size: 14px;
    color: var(--g26-cream); background: var(--g26-surface-2);
    border: 1px solid var(--g26-line-strong); border-radius: var(--g26-r-ctl);
  }
  .bs-input--sm { max-width: 90px; }
  .bs-textarea { min-height: 64px; padding: 8px 10px; resize: vertical; }
  .bs-slider { width: 100%; accent-color: var(--g26-gold); }

  .bs-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; }
  .bs-fx { margin-top: 4px; }
  .bs-btn {
    display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 14px;
    font-family: var(--g26-sans); font-size: 12px; font-weight: 800;
    color: var(--g26-ink); background: var(--g26-gold); border: 1px solid var(--g26-gold-deep);
    border-radius: var(--g26-r-ctl); cursor: pointer;
  }
  .bs-btn:disabled { opacity: 0.55; cursor: progress; }
  .bs-btn--ghost { color: var(--g26-cream); background: transparent; border-color: var(--g26-line-strong); }
  .bs-btn--danger { background: var(--g26-alert); border-color: var(--g26-alert); color: var(--g26-ink); }

  .bs-toggle {
    min-height: 40px; padding: 0 14px; font-size: 12px; font-weight: 800;
    color: var(--g26-cream); background: var(--g26-surface-2); border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-ctl); cursor: pointer;
  }
  .bs-toggle--on { color: var(--g26-ink); background: var(--g26-gold-soft); border-color: var(--g26-gold-soft); }

  .bs-chip {
    min-height: 34px; padding: 0 12px; font-size: 12px; font-weight: 700;
    color: var(--g26-dim); background: transparent; border: 1px solid var(--g26-line);
    border-radius: 999px; cursor: pointer; text-transform: capitalize;
  }
  .bs-chip--on { color: var(--g26-ink); background: var(--g26-gold-soft); border-color: var(--g26-gold-soft); }

  .bs-levels, .bs-sponsors { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
  .bs-level-row { display: flex; align-items: center; gap: 6px; }
  .bs-level-row .bs-input { flex: 1; }
  .bs-icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; flex: none;
    color: var(--g26-dim); background: var(--g26-surface-2); border: 1px solid var(--g26-line);
    border-radius: var(--g26-r-ctl); cursor: pointer;
  }
  .bs-qr { margin-top: 8px; border-radius: 4px; }
  .bs-key-out { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--g26-line); }
</style>
