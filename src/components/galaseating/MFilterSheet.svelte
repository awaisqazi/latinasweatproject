<!--
  The filter chips, out of the header and into a sheet where they fit.

  Chips stack, so "warnings" and "no entrée" together is a real question a
  planner asks. The count and the Clear pill are in the header of the Guests
  tab, so an active filter is never a mystery.
-->
<script>
  import { getContext } from "svelte";
  import { filterChips, searchGuests } from "./guestListLogic.js";
  import MSheet from "./MSheet.svelte";

  let { nav } = $props();
  const { store, ui } = getContext("gala-seating");

  const plan = $derived(store.plan);
  const byGuestWarnings = $derived(store.warnings.byGuest || {});
  const searched = $derived(searchGuests(plan, ui.listQuery));
  const chips = $derived(filterChips(plan, byGuestWarnings, searched));
  const active = $derived(ui.listChips);

  function toggle(key) {
    ui.listChips = active.includes(key) ? active.filter((k) => k !== key) : [...active, key];
  }
</script>

<MSheet title="Filters" snaps={[0.6, 0.92]} onclose={() => nav.closeTop()}>
  {#snippet subhead()}
    <span>{active.length ? `${active.length} active` : "Nothing filtered out"}</span>
  {/snippet}

  {#snippet children()}
    <div class="mfs">
      {#each chips as chip (chip.key)}
        <button
          type="button"
          class="mfs-chip"
          class:mfs-chip--on={active.includes(chip.key)}
          aria-pressed={active.includes(chip.key)}
          disabled={chip.count === 0 && !active.includes(chip.key)}
          onclick={() => toggle(chip.key)}
        >
          {chip.label}<span class="mfs-n">{chip.count}</span>
        </button>
      {/each}
    </div>
  {/snippet}

  {#snippet footer()}
    <button type="button" class="mfs-foot" onclick={() => (ui.listChips = [])} disabled={!active.length}>
      Clear filters
    </button>
    <button type="button" class="mfs-foot mfs-foot--gold" onclick={() => nav.closeTop()}>Done</button>
  {/snippet}
</MSheet>

<style>
  .mfs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .mfs-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 46px;
    padding: 0 14px;
    border: 1px solid rgba(23, 32, 44, 0.24);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 14.5px;
    cursor: pointer;
  }
  .mfs-chip--on {
    background: rgba(255, 189, 89, 0.4);
    border-color: var(--gs-gold);
    font-weight: 700;
  }
  .mfs-chip:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .mfs-n {
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
    font-size: 12.5px;
  }
  .mfs-foot {
    flex: 1 1 0;
    min-height: 50px;
    border: 1px solid rgba(23, 32, 44, 0.28);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 15px;
    cursor: pointer;
  }
  .mfs-foot:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .mfs-foot--gold {
    background: var(--gs-gold-bright);
    border-color: var(--gs-gold);
    font-weight: 700;
  }
</style>
