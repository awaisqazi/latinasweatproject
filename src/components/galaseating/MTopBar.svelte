<!--
  One pinned row at the top of the phone, with room to breathe.

  The owner's note on the old bar was "way too condensed", and it was: a
  truncated title, a wrapped save line, seven icon-only buttons and a stats
  strip clipped mid-word. So this bar holds three things and nothing else:
  what plan this is, whether it is saving and who else is in it, and two 44px
  controls. Everything that used to crowd in here now lives in the Menu sheet
  as a full-width labelled row.

  The bar does not scroll, does not wrap and is never covered: it is a
  `flex: none` child of a root sized to the visible viewport.
-->
<script>
  let {
    store,
    onsearch = () => {},
    onmenu = () => {},
    onstatus = () => {},
    menuOpen = false,
    statusOpen = false,
  } = $props();

  let now = $state(Date.now());

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 15000);
    return () => clearInterval(id);
  });

  const sync = $derived(store.sync || { status: "locked", pending: 0 });
  const people = $derived(store.people || []);

  const TONE = { live: "ok", saving: "work", loading: "work", offline: "warn", error: "bad", locked: "idle" };
  const tone = $derived(TONE[sync.status] || "idle");

  /** One short line. Never two, never wrapped. */
  const statusLine = $derived.by(() => {
    if (store.saveError) return "Not saved";
    switch (sync.status) {
      case "live":
        return people.length > 1 ? `Live · ${people.length} online` : "Live";
      case "saving":
        return "Saving";
      case "loading":
        return "Loading";
      case "offline":
        return sync.pending ? `Offline · ${sync.pending} waiting` : "Offline";
      case "error":
        return "Sync error";
      default: {
        const at = store.savedAt;
        if (!at) return "Not saved yet";
        const secs = Math.max(0, Math.round((now - at.getTime()) / 1000));
        if (secs < 45) return "Saved just now";
        if (secs < 3600) return `Saved ${Math.round(secs / 60)} min ago`;
        return `Saved ${at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      }
    }
  });
</script>

<header class="mtb">
  <button
    type="button"
    class="mtb-plan"
    onclick={onstatus}
    aria-expanded={statusOpen}
    aria-haspopup="dialog"
    aria-label="Plan status, who is online, and version history"
  >
    <span class="mtb-name gs-serif">{store.plan.meta.name}</span>
    <span class="mtb-status" data-tone={tone}>
      <span class="mtb-dot" class:mtb-dot--pulse={sync.status === "saving" || sync.status === "loading"} aria-hidden="true"></span>
      <span class="mtb-statustext">{statusLine}</span>
    </span>
  </button>

  <div class="mtb-right">
    <button type="button" class="mtb-btn" onclick={onsearch} aria-label="Search guests">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="11" cy="11" r="6.4" />
        <path d="m16 16 4.2 4.2" stroke-linecap="round" />
      </svg>
    </button>

    <button
      type="button"
      class="mtb-btn mtb-btn--menu"
      onclick={onmenu}
      aria-label="Menu"
      aria-expanded={menuOpen}
      aria-haspopup="dialog"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.9" />
        <circle cx="12" cy="12" r="1.9" />
        <circle cx="12" cy="19" r="1.9" />
      </svg>
    </button>
  </div>
</header>

<style>
  .mtb {
    flex: 0 0 auto;
    position: relative;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 6px 12px 6px 14px;
    padding-left: calc(14px + env(safe-area-inset-left));
    padding-right: calc(12px + env(safe-area-inset-right));
    padding-top: calc(6px + env(safe-area-inset-top));
    border-bottom: 1px solid rgba(228, 201, 138, 0.22);
    background: linear-gradient(180deg, rgba(18, 28, 42, 0.99), rgba(11, 19, 32, 0.99));
  }
  .mtb-plan {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 46px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 2px 0;
    background: none;
    border: none;
    text-align: left;
    color: inherit;
    font: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .mtb-plan:active .mtb-name {
    color: var(--gs-gold-bright);
  }
  .mtb-name {
    display: block;
    font-size: 17.5px;
    line-height: 1.2;
    color: var(--gs-cream);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mtb-status {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-size: 12px;
    color: #94a1b1;
  }
  .mtb-statustext {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mtb-dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #6c7a8b;
  }
  .mtb-status[data-tone="ok"] .mtb-dot {
    background: var(--gs-ok);
  }
  .mtb-status[data-tone="work"] .mtb-dot {
    background: var(--gs-gold-bright);
  }
  .mtb-status[data-tone="warn"] .mtb-dot {
    background: var(--gs-warn);
  }
  .mtb-status[data-tone="bad"] .mtb-dot {
    background: var(--gs-error);
  }
  @media (prefers-reduced-motion: no-preference) {
    .mtb-dot--pulse {
      animation: mtb-pulse 1.3s ease-in-out infinite;
    }
    @keyframes mtb-pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.3;
      }
    }
  }

  .mtb-right {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mtb-btn {
    width: 44px;
    height: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(228, 201, 138, 0.32);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.05);
    color: var(--gs-text);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .mtb-btn:active {
    background: rgba(255, 189, 89, 0.28);
    border-color: var(--gs-gold-bright);
  }
  .mtb-btn svg {
    width: 21px;
    height: 21px;
  }
  .mtb-btn--menu {
    border-color: var(--gs-line-strong);
    color: var(--gs-gold-bright);
  }

  @media (orientation: landscape) and (max-height: 559px) {
    .mtb {
      min-height: 48px;
      padding-top: 4px;
      padding-bottom: 4px;
      padding-left: 14px;
    }
    .mtb-name {
      font-size: 16px;
    }
  }
</style>
