<script>
  // A subcommittee tab's row of sub-tabs, in the module's underline look
  // with 44 px tap targets. On a phone the row scrolls sideways inside
  // itself (the page never does) and keeps the active sub-tab in view.
  import { tick } from "svelte";

  export let tabs = []; // [{ id, label, count? }]
  export let active = "";
  export let onChange = () => {};
  export let label = "Sections";

  let buttons = [];
  let strip;
  let lastActive = "";

  $: if (active !== lastActive) {
    lastActive = active;
    revealActive(tabs.findIndex((tab) => tab.id === active));
  }

  async function revealActive(index) {
    await tick();
    const button = buttons[index];
    if (!strip || !button) return;
    // Scroll the strip only, never the page.
    const left = button.offsetLeft - strip.offsetLeft;
    const right = left + button.offsetWidth;
    if (left < strip.scrollLeft) strip.scrollLeft = Math.max(0, left - 16);
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth + 16;
  }

  function select(id) {
    if (id !== active) onChange(id);
  }

  function handleKeydown(event, index) {
    const last = tabs.length - 1;
    let next = null;
    if (event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    select(tabs[next].id);
    buttons[next]?.focus();
  }
</script>

<div bind:this={strip} role="tablist" aria-label={label} class="thin-scroll -mx-4 flex gap-1 overflow-x-auto overscroll-x-contain whitespace-nowrap px-4 md:-mx-5 md:px-5">
  {#each tabs as tab, i (tab.id)}
    <button
      bind:this={buttons[i]}
      type="button"
      role="tab"
      id="tab-{tab.id}"
      aria-selected={active === tab.id}
      tabindex={active === tab.id ? 0 : -1}
      class="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border-b-2 px-3.5 text-sm font-semibold transition-colors duration-150 {active === tab.id ? 'border-brand-strong text-ink' : 'border-transparent text-ink/55 hover:text-ink'}"
      onclick={() => select(tab.id)}
      onkeydown={(event) => handleKeydown(event, i)}
    >
      {tab.label}
      {#if tab.count !== undefined && tab.count !== null}
        <span class="rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums {active === tab.id ? 'bg-brand-soft text-brand-ink' : 'bg-ink/[0.07] text-ink/65'}">
          {tab.count}
        </span>
      {/if}
    </button>
  {/each}
</div>
