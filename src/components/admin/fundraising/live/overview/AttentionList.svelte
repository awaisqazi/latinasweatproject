<script>
  // Overview block 3: what needs attention? Lines from attentionLines()
  // (src/lib/dashboard/fundraisingAttention.js), at most six before "Show
  // all". Every line is one full-width tap target: a folded line expands to
  // its items, a grant opens its prospect, anything else opens its tab and
  // sub-tab. The parent hides this block when the RPC is missing or refuses.
  import Panel from "../../../ui/Panel.svelte";
  import { ATTENTION_LINES_SHOWN, subTabId } from "../../../../../lib/dashboard/fundraisingAttention";

  export let status = "loading"; // loading | ready | error
  export let lines = [];
  export let refreshing = false;
  export let onOpenTab = () => {};
  export let onOpenProspect = () => {};
  export let onSync = () => {};
  export let onRetry = () => {};

  let showAll = false;
  let expanded = {};

  $: shown = showAll ? lines : lines.slice(0, ATTENTION_LINES_SHOWN);

  function go(target) {
    if (!target) return;
    if (target.id) {
      onOpenProspect(target.id);
      return;
    }
    if (target.tab === "overview") {
      onSync();
      return;
    }
    if (target.tab) onOpenTab(target.tab, subTabId(target));
  }

  function activate(line) {
    if (line.children.length) {
      expanded = { ...expanded, [line.key]: !expanded[line.key] };
      return;
    }
    go(line.target);
  }

  const rowClass =
    "flex min-h-11 w-full items-start justify-between gap-3 rounded-control px-2 py-2.5 text-left hover:bg-ink/[0.03]";
</script>

<Panel title="Needs attention" id="fundraising-attention-title" loading={refreshing && status === "ready"}>
  {#if status === "loading"}
    <p class="text-sm text-ink/55" role="status">Checking what needs attention…</p>
  {:else if status === "error"}
    <p class="text-sm text-ink/60">
      This list could not be loaded.{" "}<button
        type="button"
        class="inline-flex min-h-11 items-center font-semibold text-ink underline decoration-ink/25 underline-offset-2"
        onclick={onRetry}
      >Try again</button>
    </p>
  {:else if !lines.length}
    <p class="text-sm text-ink/70">Nothing needs attention right now.</p>
  {:else}
    <ul class="-mx-2 space-y-0.5">
      {#each shown as line (line.key)}
        <li>
          <button
            type="button"
            class={rowClass}
            aria-expanded={line.children.length ? Boolean(expanded[line.key]) : undefined}
            onclick={() => activate(line)}
          >
            <span class="min-w-0">
              <span class="block text-sm font-semibold leading-snug text-ink">{line.title}</span>
              {#if line.detail}
                <span class="mt-0.5 block text-xs leading-snug text-ink/55">{line.detail}</span>
              {/if}
            </span>
            {#if line.children.length}
              <span class="shrink-0 pt-0.5 text-xs font-semibold text-ink/55">{expanded[line.key] ? "Hide" : "Show"}</span>
            {:else if line.dueLabel && line.kind !== "grant_deadline"}
              <span class="shrink-0 pt-0.5 text-xs font-semibold {line.overdue ? 'text-amber-800' : 'text-ink/55'}">{line.dueLabel}</span>
            {/if}
          </button>
          {#if line.children.length && expanded[line.key]}
            <ul class="mb-2 ml-3 space-y-0.5">
              {#each line.children as child (child.key)}
                <li>
                  <button type="button" class={rowClass} onclick={() => go(child.target)}>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold leading-snug text-ink">{child.title}</span>
                      {#if child.detail}
                        <span class="mt-0.5 block text-xs leading-snug text-ink/55">{child.detail}</span>
                      {/if}
                    </span>
                    {#if child.dueLabel}
                      <span class="shrink-0 pt-0.5 text-xs font-semibold {line.overdue ? 'text-amber-800' : 'text-ink/55'}">{child.dueLabel}</span>
                    {/if}
                  </button>
                </li>
              {/each}
              {#if line.target.tab === "grants"}
                <li>
                  <button type="button" class={rowClass} onclick={() => onOpenTab("grants", subTabId(line.target))}>
                    <span class="text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-2">Open the grant pipeline</span>
                  </button>
                </li>
              {/if}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
    {#if lines.length > ATTENTION_LINES_SHOWN}
      <button
        type="button"
        class="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-ink underline decoration-ink/25 underline-offset-2 hover:decoration-ink/60"
        aria-expanded={showAll}
        onclick={() => (showAll = !showAll)}
      >
        {showAll ? "Show fewer" : `Show all ${lines.length}`}
      </button>
    {/if}
  {/if}
</Panel>
