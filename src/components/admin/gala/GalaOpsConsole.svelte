<!--
  Gala ops console: the standalone, dark, event-night toolkit at /admin/gala.

  Two events, one shell:
    - "Gala 2026" (or a ?event= override, used only for QA against a
      throwaway slug) is the LIVE event: check-in, pledges, the big screen,
      paddles, and the Thursday setup checklist. Getting in needs an admin
      session, minted one of two ways (docs/gala-2026/06 s6.1, 10 s3):
        (a) a signed-in dashboard user who holds the `gala` module ->
            gala_checkin_admin_session, no passcode;
        (b) the event's ADMIN passcode at a gate -> gala_checkin_unlock. A
            door passcode is accepted by the RPC but refused HERE: this
            console is for leads, not the check-in desk.
      If the live event does not exist yet (gala_checkin_admin_session
      answers "no-event"), this shows a calm "Event not set up yet" screen
      instead of a dead end.
    - "Gala 2025 (archive)" renders the already-built, read-only ArchiveView
      against the frozen 2025 tables. Those tables are RLS-gated, so this
      needs the dashboard Supabase session; without one it says so instead of
      pretending to load.

  Switching events is a normal navigation (?event=...), not client-side
  state: it is simpler, it is bookmarkable, and it means a botched auth
  attempt against one event can never bleed into the other. Switching TABS
  inside the live event is client-side (location.hash) so the socket and the
  in-flight session survive.

  Runes mode. Dark 2026 theme throughout (04-theme-design-spec.md s5): this
  is the night-of laptop, not the portal.
-->
<script>
  import { onDestroy, onMount, setContext } from "svelte";
  import {
    LayoutDashboard, UserCheck, HandCoins, MonitorPlay, Hash, ClipboardList,
    ArrowUpRight, LogOut, ShieldAlert, TriangleAlert, LoaderCircle,
  } from "@lucide/svelte";

  import { supabase } from "../../../lib/supabaseClient.js";
  import { hasModule, loadModuleGrants } from "../../../lib/dashboard/permissions.js";
  import { createCheckinStore } from "../../../lib/galaCheckin/store.svelte.js";
  import { createCheckinRemote } from "../../../lib/galaCheckin/remote.js";
  import { createTerminalStore } from "../../../lib/galaTerminal/store.svelte.js";
  import { createCheckinUi } from "../../galacheckin/uiState.svelte.js";
  import CheckinGate from "../../galacheckin/CheckinGate.svelte";
  import ArchiveView from "./archive/ArchiveView.svelte";
  import CheckInDesk from "./live/CheckInDesk.svelte";
  import OverviewTab from "./live/OverviewTab.svelte";
  import BigScreenTab from "./live/BigScreenTab.svelte";
  import PaddlesTab from "./live/PaddlesTab.svelte";
  import SetupTab from "./live/SetupTab.svelte";
  import PledgeTerminal from "../../galaterminal/PledgeTerminal.svelte";

  const LIVE_EVENT = "gala-2026";
  const TABS = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "checkin", label: "Check-in", icon: UserCheck },
    { id: "pledges", label: "Pledges", icon: HandCoins },
    { id: "bigscreen", label: "Big screen", icon: MonitorPlay },
    { id: "paddles", label: "Paddles", icon: Hash },
    { id: "setup", label: "Setup", icon: ClipboardList },
  ];
  const TAB_IDS = new Set(TABS.map((t) => t.id));

  // ---- read the URL once, synchronously (children mount before onMount) ----
  function readParam(name) {
    try { return new URLSearchParams(window.location.search).get(name) || ""; } catch { return ""; }
  }
  const rawEvent = (() => {
    const v = readParam("event");
    return /^[a-z0-9-]{3,40}$/.test(v) ? v : "";
  })();
  const isArchive = rawEvent === "gala-2025";
  // Any slug other than "gala-2025" is treated as the live event. In normal
  // use that is always "gala-2026"; a ?event=test-... override exists only so
  // this console can be rehearsed against a throwaway slug without ever
  // touching the real one (see the ticket's verification recipe).
  const liveSlug = isArchive ? LIVE_EVENT : (rawEvent || LIVE_EVENT);
  const isRehearsalSlug = !isArchive && liveSlug !== LIVE_EVENT;

  function readTabFromHash() {
    const id = (window.location.hash || "").replace("#", "");
    return TAB_IDS.has(id) ? id : "overview";
  }

  // ---- objects constructed synchronously; attach()/adminSession() are async
  // and only mutate their internal $state, which keeps setContext legal here.
  const checkin = createCheckinStore();
  const ui = createCheckinUi(checkin);
  const terminal = createTerminalStore();
  const checkinRemote = createCheckinRemote({ event: liveSlug });
  setContext("gala-checkin", { store: checkin, ui });

  let activeTab = $state(readTabFromHash());

  // ---- dashboard session (path a, and archive gating) ----
  let supaChecked = $state(false);
  let supaSession = $state(null);
  let profile = $state(null);
  let moduleGrants = $state.raw([]);
  const hasGala = $derived(hasModule(profile, moduleGrants, "gala"));

  // ---- live event auth: idle -> booting -> gate | door-refused | not-set-up
  //      | ready | error
  let liveState = $state("idle");
  let liveErrorReason = $state("");

  function setTab(id) {
    activeTab = id;
    try { history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${id}`); } catch { /* fine */ }
  }
  function onHashChange() { activeTab = readTabFromHash(); }

  async function loadProfileAndGrants(userId) {
    const [{ data: profileRow }, grantsRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, role").eq("id", userId).maybeSingle(),
      loadModuleGrants(supabase, userId),
    ]);
    profile = profileRow || null;
    moduleGrants = grantsRes.grants || [];
  }

  function adminName() {
    return (profile?.full_name || profile?.email || "Dashboard admin").trim().slice(0, 40) || "Dashboard admin";
  }

  /** After ANY successful token acquisition (session mint or passcode unlock),
   *  attach the shared store and check the resulting ROLE. A door passcode,
   *  or a stale door token left in this browser's storage by the volunteer
   *  check-in page (same event, same storage key), is refused HERE, never
   *  silently admitted. */
  async function afterAuthed() {
    liveState = "booting";
    const res = await checkin.attach(checkinRemote);
    if (!res.ok) {
      liveErrorReason = res.reason || "error";
      liveState = res.transient ? "error" : "gate";
      return;
    }
    if (checkin.me?.role !== "admin") {
      await checkin.logout();
      liveState = "door-refused";
      return;
    }
    await terminal.attach({ checkin, remote: checkinRemote });
    liveState = "ready";
  }

  async function bootLive() {
    liveState = "booting";
    if (checkinRemote.hasToken) {
      await afterAuthed();
      return;
    }
    if (supaSession && hasGala) {
      const res = await checkinRemote.adminSession({ name: adminName(), device: "Ops console" });
      if (res.ok) {
        await afterAuthed();
        return;
      }
      if (res.reason === "no-event") {
        liveState = "not-set-up";
        return;
      }
      // forbidden / missing-name / transient: fall through to the passcode gate
      // rather than dead-ending a signed-in admin who, for whatever reason,
      // could not get a session this way.
    }
    liveState = "gate";
  }

  async function onGateUnlock(res) {
    if (!res?.ok) return;
    await afterAuthed();
  }

  function retryDoor() {
    liveState = "gate";
  }
  function retryLive() {
    void bootLive();
  }

  onMount(async () => {
    window.addEventListener("hashchange", onHashChange);

    if (!supabase) {
      supaChecked = true;
      if (!isArchive) await bootLive();
      return;
    }

    const { data } = await supabase.auth.getSession();
    supaSession = data?.session || null;
    if (supaSession) await loadProfileAndGrants(supaSession.user.id);
    supaChecked = true;

    supabase.auth.onAuthStateChange((_event, session) => {
      supaSession = session || null;
      if (!session) { profile = null; moduleGrants = []; }
    });

    if (!isArchive) await bootLive();
  });

  onDestroy(() => {
    window.removeEventListener("hashchange", onHashChange);
    checkin.stop();
    terminal.stop();
  });

  const eventLabel = $derived(
    isArchive ? "Gala 2025" : isRehearsalSlug ? `Gala 2026 · rehearsal (${liveSlug})` : "Gala 2026",
  );
</script>

<div class="gc goc">
  <header class="goc-bar">
    <div class="goc-brand">
      <p class="goc-eyebrow">The Latina Sweat Project</p>
      <h1 class="goc-title">Ops console</h1>
    </div>

    <nav class="goc-switch" aria-label="Choose event">
      <a class="goc-switch-btn" class:goc-switch-btn--on={!isArchive} href="?event=gala-2026#overview">
        Gala 2026
      </a>
      <a class="goc-switch-btn" class:goc-switch-btn--on={isArchive} href="?event=gala-2025#overview">
        Gala 2025 (archive)
      </a>
    </nav>

    {#if !isArchive && liveState === "ready"}
      <div class="goc-tabs" role="tablist" aria-label="Gala 2026 sections">
        {#each TABS as t (t.id)}
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            class="goc-tab"
            class:goc-tab--on={activeTab === t.id}
            onclick={() => setTab(t.id)}
          >
            <t.icon size={15} strokeWidth={2.2} />
            {t.label}
          </button>
        {/each}
      </div>
    {/if}

    <a class="goc-back" href="/admin#gala">
      Back to dashboard <ArrowUpRight size={13} strokeWidth={2.4} />
    </a>
  </header>

  {#if isRehearsalSlug}
    <div class="goc-rehearsal" role="status">
      <TriangleAlert size={15} strokeWidth={2.2} />
      Rehearsal slug &quot;{liveSlug}&quot;. Nothing here is the real gala.
    </div>
  {/if}

  <main class="goc-main">
    {#if isArchive}
      {#if !supaChecked}
        <div class="goc-loading"><LoaderCircle size={22} class="goc-spin" /> Checking your dashboard session</div>
      {:else if supaSession}
        <div class="lsp-portal goc-archive-wrap">
          <ArchiveView {supabase} {profile} eventSlug="gala-2025" refreshKey={0} />
        </div>
      {:else}
        <div class="goc-panel goc-signin">
          <ShieldAlert size={22} strokeWidth={2} />
          <h2>Sign in to the dashboard to view past galas</h2>
          <p>Gala 2025 is read from the same RLS-protected tables as the rest of the admin portal, so an admin
            passcode alone cannot open it.</p>
          <a class="goc-cta" href={`/admin/marketing/login?redirectTo=${encodeURIComponent("/admin/gala?event=gala-2025")}`}>
            Go to dashboard login
          </a>
        </div>
      {/if}
    {:else if liveState === "idle" || liveState === "booting"}
      <div class="goc-loading"><LoaderCircle size={22} class="goc-spin" /> Connecting to the gala</div>
    {:else if liveState === "not-set-up"}
      <div class="goc-panel goc-notset">
        <ClipboardList size={26} strokeWidth={1.8} />
        <h2>Event not set up yet</h2>
        <p>
          You are signed in with the gala module, but no event exists yet at slug
          <code>{liveSlug}</code>. Run the Thursday seed before this screen will do anything.
        </p>
        <SetupTab event={liveSlug} standaloneChecklistOnly={true} />
        <button type="button" class="goc-btn" onclick={retryLive}>Check again</button>
      </div>
    {:else if liveState === "gate"}
      <div class="goc-gate-wrap">
        <CheckinGate
          remote={checkinRemote}
          onunlock={onGateUnlock}
          subtitle="Ops console"
          submitLabel="Open the console"
        />
      </div>
    {:else if liveState === "door-refused"}
      <div class="goc-panel goc-signin">
        <ShieldAlert size={22} strokeWidth={2} />
        <h2>This code is for the check-in desk</h2>
        <p>That passcode opens the volunteer check-in app, not the ops console. Ask the lead for the admin
          passcode, or use it at the door instead.</p>
        <a class="goc-cta" href="/gala/volunteer-checkin">Go to the check-in desk</a>
        <button type="button" class="goc-btn goc-btn--ghost" onclick={retryDoor}>Try a different code</button>
      </div>
    {:else if liveState === "error"}
      <div class="goc-panel goc-signin">
        <TriangleAlert size={22} strokeWidth={2} />
        <h2>Could not reach the gala</h2>
        <p>{liveErrorReason === "offline" ? "Check the connection and try again." : `Reason: ${liveErrorReason}`}</p>
        <button type="button" class="goc-btn" onclick={retryLive}>Try again</button>
      </div>
    {:else if liveState === "ready"}
      {#if activeTab === "overview"}
        <OverviewTab {checkin} {terminal} event={liveSlug} />
      {:else if activeTab === "checkin"}
        <CheckInDesk />
      {:else if activeTab === "pledges"}
        <div class="goc-pledges"><PledgeTerminal store={terminal} /></div>
      {:else if activeTab === "bigscreen"}
        <BigScreenTab event={liveSlug} remote={checkinRemote} onSessionDead={() => (liveState = "gate")} />
      {:else if activeTab === "paddles"}
        <PaddlesTab {checkin} />
      {:else if activeTab === "setup"}
        <SetupTab event={liveSlug} {checkin} />
      {/if}
    {/if}
  </main>
</div>

<style>
  /* Same 2026 token block as GalaCheckinApp.svelte / PledgeTerminal.svelte
     (docs/gala-2026/04-theme-design-spec.md s2.6). Declared here too, on
     purpose: every dark surface in this repo is self-contained so it never
     leaks into the public site and never depends on load order. */
  .gc {
    --g26-ink: #05070c;
    --g26-night: #0b1320;
    --g26-navy: #111a27;
    --g26-navy-2: #16212f;
    --g26-navy-3: #1b2a40;
    --g26-cream: #fff8ef;
    --g26-warm: #f2e4d2;
    --g26-text: #f3ece1;
    --g26-muted: #c3ccd8;
    --g26-dim: #a9b4c2;
    --g26-gold: #ffbd59;
    --g26-gold-strong: #f4a833;
    --g26-gold-deep: #b9842f;
    --g26-gold-soft: #e4c98a;
    --g26-gold-hi: #fff1be;
    --g26-gold-ink: #8a5700;
    --g26-ok: #5fd4b8;
    --g26-alert: #ff8a7a;
    --g26-info: #8cc4ec;

    --g26-surface-0: var(--g26-night);
    --g26-surface-1: var(--g26-navy);
    --g26-surface-2: var(--g26-navy-2);
    --g26-surface-3: var(--g26-navy-3);
    --g26-line: rgb(228 201 138 / 0.22);
    --g26-line-strong: rgb(255 189 89 / 0.55);
    --g26-focus: 0 0 0 2px var(--g26-night), 0 0 0 4px var(--g26-gold);

    --g26-serif: "Didot", "Bodoni 72", "Bodoni Moda", "Playfair Display", Georgia, serif;
    --g26-sans: "Avenir Next", "Avenir", "Rubik", "Helvetica Neue", Arial, sans-serif;

    --g26-r-chip: 2px;
    --g26-r-ctl: 3px;
    --g26-r-card: 6px;
    --g26-r-sheet: 14px;
  }

  .goc {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    color: var(--g26-text);
    font-family: var(--g26-sans);
    background: var(--g26-night);
  }

  .goc-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    padding: 10px 16px;
    padding-top: calc(10px + env(safe-area-inset-top, 0));
    background: rgb(11 19 32 / 0.96);
    border-bottom: 1px solid var(--g26-line-strong);
    position: sticky;
    top: 0;
    z-index: 20;
  }
  .goc-brand { flex: none; }
  .goc-eyebrow {
    margin: 0;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--g26-gold-ink);
  }
  .goc-title {
    margin: 1px 0 0;
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: 22px;
    line-height: 1;
    color: var(--g26-gold);
  }

  .goc-switch {
    display: flex;
    gap: 6px;
    flex: none;
  }
  .goc-switch-btn {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 12px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.02em;
    color: var(--g26-dim);
    background: transparent;
    border: 1px solid var(--g26-line);
    border-radius: 999px;
    text-decoration: none;
    white-space: nowrap;
  }
  .goc-switch-btn--on {
    color: var(--g26-ink);
    background: var(--g26-gold-soft);
    border-color: var(--g26-gold-soft);
  }

  .goc-tabs {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
    flex: 1 1 260px;
  }
  .goc-tabs::-webkit-scrollbar { display: none; }
  .goc-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 12px;
    font-family: var(--g26-sans);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.02em;
    white-space: nowrap;
    color: var(--g26-dim);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .goc-tab--on {
    color: var(--g26-ink);
    background: var(--g26-gold);
  }
  .goc-tab:focus-visible { outline: none; box-shadow: var(--g26-focus); }

  .goc-back {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    font-size: 12px;
    font-weight: 700;
    color: var(--g26-dim);
    text-decoration: none;
  }
  .goc-back:hover { color: var(--g26-gold-soft); }

  .goc-rehearsal {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 700;
    color: var(--g26-ink);
    background: var(--g26-gold-soft);
  }

  .goc-main {
    flex: 1;
    min-height: 0;
    padding: 16px;
  }

  .goc-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 50vh;
    color: var(--g26-dim);
    font-size: 14px;
  }
  :global(.goc-spin) { animation: goc-spin 1s linear infinite; }
  @keyframes goc-spin { to { transform: rotate(360deg); } }

  .goc-panel {
    max-width: 640px;
    margin: 6vh auto 0;
    padding: 28px 24px;
    background: var(--g26-surface-1);
    border: 1px solid var(--g26-line);
    border-radius: var(--g26-r-card);
  }
  .goc-signin, .goc-notset {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    color: var(--g26-gold-soft);
  }
  .goc-signin h2, .goc-notset h2 {
    margin: 4px 0 0;
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: 22px;
    color: var(--g26-cream);
  }
  .goc-signin p, .goc-notset p {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--g26-dim);
  }
  .goc-notset code {
    padding: 1px 6px;
    font-size: 13px;
    background: var(--g26-surface-2);
    border: 1px solid var(--g26-line);
    border-radius: var(--g26-r-chip);
    color: var(--g26-gold-soft);
  }

  .goc-cta, .goc-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 0 18px;
    font-family: var(--g26-sans);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.04em;
    color: var(--g26-ink);
    background: var(--g26-gold);
    border: 1px solid var(--g26-gold-deep);
    border-radius: var(--g26-r-ctl);
    text-decoration: none;
    cursor: pointer;
  }
  .goc-btn--ghost {
    color: var(--g26-cream);
    background: transparent;
    border-color: var(--g26-line-strong);
  }

  .goc-gate-wrap { min-height: 70vh; }
  .goc-pledges { height: calc(100dvh - 130px); min-height: 480px; }

  .goc-archive-wrap {
    background: #f6f2ea;
    border-radius: var(--g26-r-card);
    padding: 16px;
  }

  @media (max-width: 720px) {
    .goc-bar { gap: 8px; }
    .goc-title { font-size: 18px; }
    .goc-main { padding: 10px; }
  }
</style>
