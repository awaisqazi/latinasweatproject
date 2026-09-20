<!-- How the guest list is ordered. Five choices, one tap, sheet closes. -->
<script>
  import { getContext } from "svelte";
  import { SORTS } from "./guestListLogic.js";
  import MSheet from "./MSheet.svelte";

  let { nav } = $props();
  const { ui } = getContext("gala-seating");

  function choose(id) {
    ui.listSort = id;
    nav.closeTop();
  }
</script>

<MSheet title="Sort by" snaps={[0.5, 0.8]} onclose={() => nav.closeTop()}>
  {#snippet children()}
    <ul class="msr">
      {#each SORTS as option (option.id)}
        <li>
          <button
            type="button"
            class="msr-row"
            class:msr-row--on={ui.listSort === option.id}
            aria-pressed={ui.listSort === option.id}
            onclick={() => choose(option.id)}
          >
            {option.label}
            {#if ui.listSort === option.id}<span class="msr-tick" aria-hidden="true">✓</span>{/if}
          </button>
        </li>
      {/each}
    </ul>
  {/snippet}
</MSheet>

<style>
  .msr {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .msr-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-height: 54px;
    padding: 10px 12px;
    margin-bottom: 6px;
    border: 1px solid rgba(23, 32, 44, 0.2);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 15.5px;
    text-align: left;
    cursor: pointer;
  }
  .msr-row--on {
    background: rgba(255, 189, 89, 0.34);
    border-color: var(--gs-gold);
    font-weight: 700;
  }
  .msr-tick {
    color: #6b4a12;
    font-size: 17px;
  }
</style>
