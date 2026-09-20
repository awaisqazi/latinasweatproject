<!-- Rename the plan. One field, 16px, and a keyboard that cannot hide it. -->
<script>
  import { getContext, tick } from "svelte";
  import MSheet from "./MSheet.svelte";

  let { nav } = $props();
  const { store } = getContext("gala-seating");

  let draft = $state(store.plan.meta.name);
  let inputEl = $state(null);

  $effect(() => {
    tick().then(() => inputEl?.focus());
  });

  function save() {
    const next = String(draft ?? "").trim();
    if (next && next !== store.plan.meta.name) store.renamePlan(next);
    nav.closeTop();
  }
</script>

<MSheet title="Rename this plan" snaps={[0.42, 0.8]} onclose={() => nav.closeTop()}>
  {#snippet children()}
    <label class="mrs-lbl" for="mrs-name">Plan name</label>
    <input
      id="mrs-name"
      class="mrs-input"
      bind:this={inputEl}
      value={draft}
      maxlength="90"
      oninput={(e) => (draft = e.currentTarget.value)}
      onkeydown={(e) => {
        if (e.key === "Enter") save();
      }}
    />
  {/snippet}

  {#snippet footer()}
    <button type="button" class="mrs-btn" onclick={() => nav.closeTop()}>Cancel</button>
    <button type="button" class="mrs-btn mrs-btn--gold" onclick={save}>Save</button>
  {/snippet}
</MSheet>

<style>
  .mrs-lbl {
    display: block;
    font-size: 12.5px;
    color: #5f6875;
    margin-bottom: 6px;
  }
  .mrs-input {
    width: 100%;
    min-height: 50px;
    padding: 12px;
    border: 1px solid rgba(23, 32, 44, 0.28);
    border-radius: 3px;
    background: #fffdf9;
    color: var(--gs-ink);
    font: inherit;
    font-size: 16px;
  }
  .mrs-btn {
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
  .mrs-btn--gold {
    background: var(--gs-gold-bright);
    border-color: var(--gs-gold);
    font-weight: 700;
  }
</style>
