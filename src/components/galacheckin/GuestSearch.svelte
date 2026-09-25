<!--
  The search box, which is the whole app for the first two seconds of every
  conversation at the door.

  The placeholder teaches the fastest query there is: two short fragments. In
  the real list, first two letters plus last two letters is unique for more than
  four guests in five. First OR last name, any order, accents ignored
  ("gomez" finds "Gómez"): derive.js matchGuests, unit tested.

  The field takes focus as soon as the list is up (on a laptop the volunteer
  can just type; iOS opens the keyboard on the first tap) and again after
  every "Done", so the next guest is one keystroke away.
-->
<script>
  import { getContext, onMount } from "svelte";
  import { LATE_NIGHT } from "../../lib/galaCheckin/derive.js";
  import { Search, X } from "@lucide/svelte";

  const { store, ui } = getContext("gala-checkin");

  const FILTERS = [
    { id: "all", label: "All" },
    { id: "waiting", label: "Not arrived" },
    { id: "arrived", label: "Arrived" },
    { id: "late", label: LATE_NIGHT },
  ];

  let input = $state(null);

  const counts = $derived.by(() => {
    const t = store.stats.totals;
    return { all: t.guests, waiting: t.guests - t.checked_in, arrived: t.checked_in, late: t.late_night };
  });

  onMount(() => {
    ui.registerSearch(input);
    try { input?.focus({ preventScroll: true }); } catch { /* fine */ }
  });
</script>

<div class="gs">
  <div class="gs-wrap">
    <span class="gs-icon" aria-hidden="true"><Search size={20} strokeWidth={2} /></span>
    <input
      class="gs-input"
      type="search"
      inputmode="search"
      autocomplete="off"
      autocapitalize="off"
      autocorrect="off"
      spellcheck="false"
      enterkeyhint="search"
      aria-label="Search guests"
      placeholder="First or last name, table, paddle"
      value={ui.query}
      oninput={(e) => (ui.query = e.currentTarget.value)}
      bind:this={input}
    />
    {#if ui.query}
      <button
        type="button"
        class="gs-clear"
        aria-label="Clear search"
        onclick={() => { ui.query = ""; input?.focus(); }}
      >
        <X size={18} strokeWidth={2.4} />
      </button>
    {/if}
  </div>

  <div class="gs-filters" role="group" aria-label="Filter the list">
    {#each FILTERS as f (f.id)}
      <button
        type="button"
        class="gs-chip"
        class:gs-chip--on={ui.filter === f.id}
        aria-pressed={ui.filter === f.id}
        onclick={() => (ui.filter = f.id)}
      >{f.label} <span class="gs-n">{counts[f.id]}</span></button>
    {/each}
  </div>
</div>

<style>
  .gs {
    display: grid;
    gap: 8px;
    padding: 8px 12px 10px;
    background: rgb(11 19 32 / 0.94);
    border-bottom: 1px solid var(--g26-line);
    backdrop-filter: blur(6px);
  }

  .gs-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }
  .gs-icon {
    position: absolute;
    left: 12px;
    display: grid;
    place-items: center;
    color: var(--g26-dim);
    pointer-events: none;
  }
  .gs-input {
    width: 100%;
    min-height: 56px;
    padding: 0 46px 0 42px;
    font-family: var(--g26-sans);
    /* 16px or more: below that, iOS Safari zooms the page on focus. */
    font-size: 17px;
    font-weight: 600;
    color: var(--g26-cream);
    background: var(--g26-surface-2);
    border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-ctl);
    -webkit-appearance: none;
    appearance: none;
  }
  .gs-input::placeholder {
    color: var(--g26-dim);
    font-weight: 500;
  }
  .gs-input::-webkit-search-cancel-button {
    display: none;
  }
  .gs-input:focus-visible {
    outline: none;
    border-color: var(--g26-gold);
    box-shadow: var(--g26-focus);
  }
  .gs-clear {
    position: absolute;
    right: 4px;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    color: var(--g26-dim);
    background: transparent;
    border: 0;
    cursor: pointer;
  }
  .gs-clear:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }

  .gs-filters {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .gs-filters::-webkit-scrollbar {
    display: none;
  }
  .gs-chip {
    flex: none;
    min-height: 48px;
    padding: 0 14px;
    font-family: var(--g26-sans);
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--g26-text);
    background: transparent;
    border: 1px solid var(--g26-line-strong);
    border-radius: var(--g26-r-chip);
    cursor: pointer;
    white-space: nowrap;
  }
  .gs-n {
    margin-left: 4px;
    font-variant-numeric: tabular-nums lining-nums;
    opacity: 0.85;
  }
  .gs-chip--on {
    color: var(--g26-ink);
    background: var(--g26-gold);
    border-color: var(--g26-gold);
  }
  .gs-chip:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }
</style>
