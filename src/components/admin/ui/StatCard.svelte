<script>
  import Skeleton from "./Skeleton.svelte";

  // Successor to SummaryCard: same label/value/icon/tone signature.
  export let label;
  export let value = 0;
  export let icon = null;
  export let tone = "gold"; // gold | teal | rose | neutral
  export let hint = "";
  export let loading = false;

  const TONES = {
    gold: "bg-brand-soft text-brand-ink",
    teal: "bg-accent-soft text-accent-strong",
    rose: "bg-red-50 text-red-700",
    neutral: "bg-ink/[0.06] text-ink/70",
  };

  $: toneClass = TONES[tone] || TONES.gold;
</script>

<article class="relative overflow-hidden rounded-card border border-ink/8 bg-white p-4 shadow-card">
  <span class="absolute inset-y-3 left-0 w-[3px] rounded-r-full {tone === 'teal' ? 'bg-accent' : tone === 'rose' ? 'bg-red-400' : tone === 'neutral' ? 'bg-ink/20' : 'bg-brand'}" aria-hidden="true"></span>
  <div class="flex items-center justify-between gap-3 pl-2">
    <div class="min-w-0">
      <p class="truncate text-[13px] font-medium uppercase tracking-wide text-ink/55">{label}</p>
      {#if loading}
        <Skeleton variant="text" class="mt-2.5 h-7 w-16" />
      {:else}
        <p class="mt-1.5 text-3xl font-bold tabular-nums text-ink">{value}</p>
      {/if}
      {#if hint}
        <p class="mt-1 truncate text-xs text-ink/50">{hint}</p>
      {/if}
    </div>
    {#if icon}
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-card {toneClass}">
        <svelte:component this={icon} class="h-5 w-5" aria-hidden="true" />
      </span>
    {/if}
  </div>
</article>
