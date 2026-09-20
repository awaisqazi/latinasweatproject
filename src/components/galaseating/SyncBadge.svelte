<!--
  The pill in the toolbar that answers "is my work safe, and who else is in here".

  It reads store.sync and store.people; it never talks to Postgres except to list
  server snapshots for the drawer. There is no conflict state by design: edits are
  ops, the server applies them in order, and everyone converges. The worst case is
  "Offline, n changes waiting", which resolves itself when the network returns.

  "Lock" forgets the passcode on this device and reloads, so a planner can hand
  back a borrowed laptop.
-->
<script>
  import { forgetPasscode } from "../../lib/galaSeating/remote.js";

  let { store, remote = null } = $props();

  let open = $state(false);
  let versions = $state([]);
  let loadingVersions = $state(false);
  let versionError = $state("");
  let busyVersion = $state(0);
  let labelDraft = $state("");
  let savingLabel = $state(false);
  let now = $state(Date.now());
  let panel = $state(null);

  const link = $derived(remote || store?.remote || null);
  const sync = $derived(store?.sync || { status: "locked", pending: 0 });
  const people = $derived(store?.people || []);
  const pending = $derived(sync.pending || 0);

  const TONE = {
    live: "ok",
    saving: "work",
    loading: "work",
    offline: "warn",
    error: "bad",
    locked: "idle",
  };
  const tone = $derived(TONE[sync.status] || "idle");

  const label = $derived.by(() => {
    switch (sync.status) {
      case "live":
        return people.length > 1
          ? `Live · ${people.length} planners online`
          : `Live${sync.updatedBy ? ` · saved by ${sync.updatedBy}` : ""}`;
      case "saving":
        return "Saving";
      case "loading":
        return "Loading the shared plan";
      case "offline":
        return pending ? `Offline · ${pending} ${pending === 1 ? "change" : "changes"} waiting` : "Offline, working locally";
      case "error":
        return "Sync error";
      default:
        return "Not connected";
    }
  });

  // One timer, so "2 min ago" stays honest without a clock per row.
  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 20000);
    return () => clearInterval(id);
  });

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }

  function ago(value) {
    if (!value) return "";
    const then = new Date(value).getTime();
    if (!Number.isFinite(then)) return "";
    const secs = Math.max(0, Math.round((now - then) / 1000));
    if (secs < 45) return "just now";
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function focusDetail(person) {
    if (!person?.focus) return "";
    if (person.focus.tableId) return "at a table";
    if (person.focus.guestId) return "on a guest";
    return "";
  }

  async function toggle() {
    open = !open;
    if (open) {
      labelDraft = "";
      await loadVersions();
      queueMicrotask(() => panel?.focus());
    }
  }

  async function loadVersions() {
    if (!link?.history) {
      versions = [];
      versionError = "Version history needs the shared plan.";
      return;
    }
    loadingVersions = true;
    versionError = "";
    try {
      versions = await link.history();
      if (!versions.length) versionError = "No saved versions yet.";
    } catch {
      versionError = "Could not load version history.";
    } finally {
      loadingVersions = false;
    }
  }

  async function restore(version) {
    const row = versions.find((v) => v.version === version);
    const when = row ? ago(row.at) : "";
    const ok = window.confirm(
      `Replace the shared plan with version ${version}${when ? ` from ${when}` : ""}?\n\n` +
        "Everyone editing right now will see this version. A backup of the current plan is kept on this device."
    );
    if (!ok) return;

    busyVersion = version;
    try {
      await store.loadRemoteVersion(version);
      await loadVersions();
    } finally {
      busyVersion = 0;
    }
  }

  async function saveNamed() {
    const name = labelDraft.trim();
    if (!name || savingLabel) return;
    savingLabel = true;
    try {
      if (store?.saveVersion) await store.saveVersion(name);
      else await link?.snapshot?.(name);
      labelDraft = "";
      await loadVersions();
    } finally {
      savingLabel = false;
    }
  }

  function retry() {
    if (!link || !store?.attachRemote) return;
    void store.attachRemote(link, store.editorName || "");
  }

  function lock() {
    forgetPasscode();
    window.location.reload();
  }

  function onPanelKeydown(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      open = false;
    }
  }
</script>

<div class="sb-wrap">
  <button
    type="button"
    class="sb-pill sb-pill--{tone}"
    onclick={toggle}
    aria-expanded={open}
    aria-haspopup="dialog"
    title="Sync status, who is online, and version history"
  >
    <span class="sb-dot" class:sb-dot--pulse={sync.status === "saving" || sync.status === "loading"} aria-hidden="true"
    ></span>
    <span class="sb-label">{label}</span>

    {#if people.length}
      <span class="sb-faces" aria-hidden="true">
        {#each people.slice(0, 4) as person (person.client)}
          <span class="sb-face" style="background:{person.color}" title={person.editor}>{initials(person.editor)}</span>
        {/each}
        {#if people.length > 4}
          <span class="sb-face sb-face--more">+{people.length - 4}</span>
        {/if}
      </span>
    {/if}
  </button>

  {#if sync.status === "error"}
    <button type="button" class="sb-retry" onclick={retry}>Retry</button>
  {/if}

  {#if open}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="sb-drawer"
      role="dialog"
      aria-label="Version history"
      tabindex="-1"
      bind:this={panel}
      onkeydown={onPanelKeydown}
    >
      <div class="sb-head">
        <h2 class="sb-title">Version history</h2>
        <button type="button" class="sb-x" onclick={() => (open = false)} aria-label="Close">Close</button>
      </div>

      <section class="sb-section">
        <h3 class="sb-sub">Who is here</h3>
        {#if people.length}
          <ul class="sb-people">
            {#each people as person (person.client)}
              <li class="sb-person">
                <span class="sb-face" style="background:{person.color}" aria-hidden="true">{initials(person.editor)}</span>
                <span class="sb-person-name">{person.editor || "Someone"}</span>
                {#if focusDetail(person)}
                  <span class="sb-person-focus">{focusDetail(person)}</span>
                {/if}
              </li>
            {/each}
          </ul>
        {:else}
          <p class="sb-empty">Just you right now.</p>
        {/if}
        {#if sync.updatedAt}
          <p class="sb-meta">
            Version {sync.version} · saved {ago(sync.updatedAt)}{sync.updatedBy ? ` by ${sync.updatedBy}` : ""}
          </p>
        {/if}
      </section>

      <section class="sb-section">
        <h3 class="sb-sub">Save a named version</h3>
        <div class="sb-saverow">
          <label class="sb-vh" for="sb-label">Version name</label>
          <input
            id="sb-label"
            class="sb-input"
            type="text"
            maxlength="80"
            placeholder="Before the sponsor swap"
            bind:value={labelDraft}
            disabled={savingLabel}
          />
          <button
            type="button"
            class="sb-btn"
            onclick={saveNamed}
            disabled={savingLabel || !labelDraft.trim()}
          >
            {savingLabel ? "Saving" : "Save"}
          </button>
        </div>
        <p class="sb-fine">Named versions are kept on the server until someone deletes them.</p>
      </section>

      <section class="sb-section">
        <h3 class="sb-sub">Saved versions</h3>
        {#if loadingVersions}
          <p class="sb-empty">Loading.</p>
        {:else if versionError}
          <p class="sb-empty">{versionError}</p>
        {:else}
          <ul class="sb-versions">
            {#each versions as row (row.version)}
              <li class="sb-version">
                <div class="sb-version-main">
                  <p class="sb-version-top">
                    {#if row.label}<span class="sb-tag">{row.label}</span>{/if}
                    <span class="sb-version-when">{ago(row.at)}</span>
                  </p>
                  <p class="sb-version-sub">
                    Version {row.version}{row.editor ? ` · ${row.editor}` : ""} · {row.guestCount} guests, {row.seatedCount} seated
                  </p>
                </div>
                <button
                  type="button"
                  class="sb-btn sb-btn--quiet"
                  onclick={() => restore(row.version)}
                  disabled={busyVersion === row.version}
                >
                  {busyVersion === row.version ? "Restoring" : "Restore this version"}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <div class="sb-foot">
        <button type="button" class="sb-lock" onclick={lock}>Lock this device</button>
        <span class="sb-fine">Forgets the passcode here and reloads.</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .sb-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .sb-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    max-width: 18rem;
    padding: 0.3rem 0.6rem;
    font-size: 0.76rem;
    color: rgb(255 248 239 / 0.86);
    background: rgb(255 255 255 / 0.05);
    border: 1px solid rgb(255 189 89 / 0.28);
    border-radius: 999px;
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease;
  }
  .sb-pill:hover {
    border-color: rgb(255 189 89 / 0.6);
    background: rgb(255 189 89 / 0.08);
  }
  .sb-pill:focus-visible {
    outline: 2px solid #e4c98a;
    outline-offset: 2px;
  }

  .sb-label {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .sb-dot {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 999px;
    background: currentColor;
    flex: none;
  }
  .sb-pill--ok .sb-dot { background: #7fb8b0; }
  .sb-pill--work .sb-dot { background: #e4c98a; }
  .sb-pill--warn .sb-dot { background: #d9a066; }
  .sb-pill--bad .sb-dot { background: #e08a9b; }
  .sb-pill--idle .sb-dot { background: rgb(255 248 239 / 0.35); }

  .sb-pill--bad { border-color: rgb(224 138 155 / 0.55); }
  .sb-pill--warn { border-color: rgb(217 160 102 / 0.5); }

  @media (prefers-reduced-motion: no-preference) {
    .sb-dot--pulse {
      animation: sb-pulse 1.4s ease-in-out infinite;
    }
  }
  @keyframes sb-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .sb-faces {
    display: inline-flex;
    padding-left: 0.2rem;
  }

  .sb-face {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    margin-left: -0.35rem;
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: #14202f;
    border: 1px solid #0b1320;
    border-radius: 999px;
    flex: none;
  }
  .sb-face--more {
    color: rgb(255 248 239 / 0.8);
    background: rgb(255 255 255 / 0.12);
  }

  .sb-retry {
    padding: 0.25rem 0.55rem;
    font-size: 0.72rem;
    color: #0b1320;
    background: #e4c98a;
    border: 0;
    border-radius: 999px;
    cursor: pointer;
  }

  .sb-drawer {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    z-index: 60;
    width: min(22rem, calc(100vw - 1.5rem));
    max-height: min(32rem, calc(100dvh - 6rem));
    overflow-y: auto;
    padding: 1rem;
    color: #1e1e1e;
    background: #fff8ef;
    border: 1px solid rgb(185 132 47 / 0.5);
    border-radius: 4px;
    box-shadow: 0 26px 60px -26px rgb(0 0 0 / 0.7);
  }
  .sb-drawer:focus-visible {
    outline: 2px solid #b9842f;
    outline-offset: -2px;
  }

  .sb-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .sb-title {
    margin: 0;
    font-family: var(--font-display);
    font-style: italic;
    font-size: 1.15rem;
    font-weight: 500;
  }

  .sb-x {
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #8a5700;
    background: none;
    border: 0;
    cursor: pointer;
  }

  .sb-section {
    padding-top: 0.75rem;
    border-top: 1px solid rgb(185 132 47 / 0.25);
  }
  .sb-section:first-of-type {
    padding-top: 0;
    border-top: 0;
  }

  .sb-sub {
    margin: 0 0 0.45rem;
    font-size: 0.66rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgb(30 30 30 / 0.55);
  }

  .sb-people,
  .sb-versions {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sb-person {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.18rem 0;
    font-size: 0.85rem;
  }
  .sb-person .sb-face {
    margin-left: 0;
    border-color: rgb(30 30 30 / 0.15);
  }
  .sb-person-name {
    font-weight: 500;
  }
  .sb-person-focus {
    font-size: 0.75rem;
    color: rgb(30 30 30 / 0.5);
  }

  .sb-meta,
  .sb-empty {
    margin: 0.45rem 0 0;
    font-size: 0.78rem;
    color: rgb(30 30 30 / 0.6);
  }

  .sb-saverow {
    display: flex;
    gap: 0.4rem;
  }

  .sb-vh {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .sb-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.42rem 0.5rem;
    font: inherit;
    font-size: 0.85rem;
    background: rgb(255 255 255 / 0.8);
    border: 1px solid rgb(30 30 30 / 0.25);
    border-radius: 2px;
  }
  .sb-input:focus-visible {
    outline: none;
    border-color: #b9842f;
    box-shadow: 0 0 0 3px rgb(185 132 47 / 0.2);
  }

  .sb-btn {
    padding: 0.42rem 0.7rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #1e1e1e;
    background: #ffbd59;
    border: 0;
    border-radius: 2px;
    cursor: pointer;
    flex: none;
  }
  .sb-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .sb-btn--quiet {
    color: #8a5700;
    background: transparent;
    border: 1px solid rgb(185 132 47 / 0.5);
    white-space: nowrap;
  }
  .sb-btn--quiet:hover:not(:disabled) {
    background: rgb(185 132 47 / 0.1);
  }

  .sb-fine {
    margin: 0.4rem 0 0;
    font-size: 0.7rem;
    color: rgb(30 30 30 / 0.5);
  }

  .sb-version {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.6rem;
    padding: 0.4rem 0;
    border-bottom: 1px dotted rgb(30 30 30 / 0.14);
  }
  .sb-version:last-child {
    border-bottom: 0;
  }

  .sb-version-main {
    min-width: 0;
  }

  .sb-version-top {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin: 0;
    font-size: 0.82rem;
  }

  .sb-tag {
    padding: 0.05rem 0.3rem;
    font-size: 0.68rem;
    font-weight: 600;
    color: #8a5700;
    background: rgb(255 189 89 / 0.22);
    border-radius: 2px;
  }

  .sb-version-when {
    color: rgb(30 30 30 / 0.75);
  }

  .sb-version-sub {
    margin: 0.1rem 0 0;
    font-size: 0.72rem;
    color: rgb(30 30 30 / 0.55);
  }

  .sb-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem;
    margin-top: 0.9rem;
    padding-top: 0.7rem;
    border-top: 1px solid rgb(185 132 47 / 0.25);
  }

  .sb-lock {
    padding: 0.35rem 0.6rem;
    font-size: 0.75rem;
    color: #1e1e1e;
    background: transparent;
    border: 1px solid rgb(30 30 30 / 0.35);
    border-radius: 2px;
    cursor: pointer;
  }
  .sb-lock:hover {
    background: rgb(30 30 30 / 0.06);
  }
  .sb-foot .sb-fine {
    margin: 0;
  }
</style>
