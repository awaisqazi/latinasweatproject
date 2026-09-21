<!--
  The bottom tab bar: the answer to "how do I get back to the map".

  Always on screen, always in thumb reach, never covered by a sheet's content.
  The active tab is gold and labelled, so it reads at a glance in a dark
  ballroom. In landscape it becomes a slim rail down the left so the map keeps
  the full height of a 390px screen.
-->
<script>
  let { tab = "map", guests = 0, alerts = 0, onselect = () => {} } = $props();

  const TABS = [
    { id: "map", label: "Map" },
    { id: "guests", label: "Guests" },
    { id: "tables", label: "Tables" },
    { id: "alerts", label: "Alerts" },
  ];

  function badgeFor(id) {
    if (id === "guests") return guests;
    if (id === "alerts") return alerts;
    return 0;
  }

  function badgeText(n) {
    return n > 99 ? "99+" : String(n);
  }
</script>

<nav class="mt" aria-label="Planner sections">
  {#each TABS as item (item.id)}
    {@const n = badgeFor(item.id)}
    <button
      type="button"
      class="mt-tab"
      class:mt-tab--on={tab === item.id}
      aria-current={tab === item.id ? "page" : undefined}
      onclick={() => onselect(item.id)}
    >
      <span class="mt-ico" aria-hidden="true">
        {#if item.id === "map"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" stroke-linejoin="round" />
            <path d="M9 4v13.5M15 6.5V20" />
          </svg>
        {:else if item.id === "guests"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="9" cy="8" r="3.4" />
            <path d="M3 19.5c0-3.2 2.7-5.2 6-5.2s6 2 6 5.2" stroke-linecap="round" />
            <path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14.6c2.1.6 3.5 2.3 3.5 4.9" stroke-linecap="round" />
          </svg>
        {:else if item.id === "tables"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="12" cy="12" r="5" />
            <circle cx="12" cy="4.2" r="1.5" />
            <circle cx="12" cy="19.8" r="1.5" />
            <circle cx="4.2" cy="12" r="1.5" />
            <circle cx="19.8" cy="12" r="1.5" />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 4 2.8 20h18.4z" stroke-linejoin="round" />
            <path d="M12 10.5v4M12 17.4v.2" stroke-linecap="round" />
          </svg>
        {/if}
      </span>
      <span class="mt-lbl">{item.label}</span>
      {#if n > 0}
        <!-- The number is decoration; the sentence after it is what is read. -->
        <span class="mt-badge" data-kind={item.id} aria-hidden="true">{badgeText(n)}</span>
        <span class="gs-sr">{n} {item.id === "alerts" ? "to review" : "unseated"}</span>
      {/if}
    </button>
  {/each}
</nav>

<style>
  /* In the flow, not floating: the shell is a flex column sized to the visible
     viewport, so the bar is on screen by construction rather than by a z-index
     bet against Safari's collapsing toolbar. */
  .mt {
    flex: 0 0 auto;
    position: relative;
    z-index: 64;
    display: flex;
    align-items: stretch;
    background: linear-gradient(180deg, rgba(14, 22, 36, 0.98), rgba(8, 13, 22, 0.99));
    border-top: 1px solid rgba(228, 201, 138, 0.26);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    box-shadow: 0 -14px 40px -26px rgba(0, 0, 0, 0.95);
  }
  .mt-tab {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    min-height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 6px 2px 7px;
    background: none;
    border: none;
    border-top: 2px solid transparent;
    color: #9aa7b6;
    font: inherit;
    font-size: 11px;
    letter-spacing: 0.04em;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .mt-tab--on {
    color: var(--gs-gold-bright);
    border-top-color: var(--gs-gold-bright);
    background: rgba(255, 189, 89, 0.1);
  }
  .mt-tab--on .mt-lbl {
    font-weight: 700;
  }
  .mt-ico {
    display: block;
  }
  .mt-ico svg {
    width: 22px;
    height: 22px;
    display: block;
  }
  .mt-lbl {
    line-height: 1;
  }
  .mt-badge {
    position: absolute;
    top: 4px;
    left: 50%;
    margin-left: 6px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--gs-gold-bright);
    color: #17202c;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .mt-badge[data-kind="alerts"] {
    background: var(--gs-error);
    color: #fff3f0;
  }
  :global(.gs-sr) {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }

  /* Landscape phone: a rail down the left keeps the room full height. */
  @media (orientation: landscape) and (max-height: 559px) {
    .mt {
      width: 72px;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      border-top: 0;
      border-right: 1px solid rgba(228, 201, 138, 0.26);
      padding-bottom: env(safe-area-inset-bottom);
      padding-top: env(safe-area-inset-top);
      box-shadow: 14px 0 40px -26px rgba(0, 0, 0, 0.95);
    }
    .mt-tab {
      flex: 0 0 auto;
      min-height: 54px;
      border-top: 0;
      border-left: 2px solid transparent;
    }
    .mt-tab--on {
      border-top-color: transparent;
      border-left-color: var(--gs-gold-bright);
    }
    .mt-badge {
      top: 2px;
      left: 54%;
    }
  }
</style>
