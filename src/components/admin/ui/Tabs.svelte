<script>
  // Tab strip with full tablist keyboard pattern. Routing/content stays the
  // parent's job: bind `active` or use onChange.
  export let tabs = []; // [{ id, label, icon?, count? }]
  export let active = "";
  export let onChange = null;
  export let variant = "underline"; // underline | segmented | pills
  export let label = "Sections";
  export let stretch = false;
  // Set false when tabs act as filters with no tabpanel elements, so
  // aria-controls never points at ids that do not exist.
  export let hasPanels = true;

  let buttons = [];

  function select(id) {
    if (id === active) return;
    active = id;
    if (onChange) onChange(id);
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

  const WRAPS = {
    underline: "gap-1 border-b border-ink/10",
    segmented: "gap-1 rounded-control border border-ink/10 bg-ink/[0.04] p-1",
    pills: "gap-1.5",
  };

  function tabClass(isActive) {
    if (variant === "segmented") {
      return isActive
        ? "rounded-[6px] bg-white text-ink shadow-card"
        : "rounded-[6px] text-ink/55 hover:text-ink";
    }
    if (variant === "pills") {
      return isActive
        ? "rounded-full bg-ink text-white"
        : "rounded-full border border-ink/12 bg-white text-ink/65 hover:border-ink/30 hover:text-ink";
    }
    // underline: gold foil indicator under the active tab
    return isActive
      ? "border-b-2 border-brand-strong text-ink -mb-px"
      : "border-b-2 border-transparent text-ink/55 hover:text-ink -mb-px";
  }
</script>

<div
  role="tablist"
  aria-label={label}
  class="thin-scroll flex overflow-x-auto whitespace-nowrap {WRAPS[variant] || WRAPS.underline}"
>
  {#each tabs as tab, i (tab.id)}
    <button
      bind:this={buttons[i]}
      type="button"
      role="tab"
      id="tab-{tab.id}"
      aria-selected={active === tab.id}
      aria-controls={hasPanels ? `tabpanel-${tab.id}` : undefined}
      tabindex={active === tab.id ? 0 : -1}
      class="inline-flex min-h-10 items-center justify-center gap-2 px-3.5 text-sm font-semibold transition-colors duration-150 {tabClass(active === tab.id)} {stretch ? 'flex-1' : ''}"
      onclick={() => select(tab.id)}
      onkeydown={(event) => handleKeydown(event, i)}
    >
      {#if tab.icon}
        <svelte:component this={tab.icon} class="h-4 w-4 shrink-0" aria-hidden="true" />
      {/if}
      {tab.label}
      {#if tab.count !== undefined && tab.count !== null}
        <span class="rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums {active === tab.id ? 'bg-brand-soft text-brand-ink' : 'bg-ink/[0.07] text-ink/65'}">
          {tab.count}
        </span>
      {/if}
    </button>
  {/each}
</div>
