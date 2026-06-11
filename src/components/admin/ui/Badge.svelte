<script>
  // Status badge. One tone map for the whole portal; soft is the default
  // ledger-stamp look, solid is reserved for high-signal moments.
  export let tone = "neutral"; // neutral | gold | teal | green | blue | amber | red
  export let variant = "soft"; // soft | solid | outline
  export let dot = false;
  export let size = "sm"; // sm | xs
  let className = "";
  export { className as class };

  const TONES = {
    neutral: {
      soft: "bg-ink/[0.06] text-ink/80",
      solid: "bg-ink text-white",
      outline: "border border-ink/20 text-ink/80",
      dot: "bg-ink/50",
    },
    gold: {
      soft: "bg-brand-soft text-brand-ink",
      solid: "bg-brand text-ink",
      outline: "border border-brand-strong/50 text-brand-ink",
      dot: "bg-brand-strong",
    },
    teal: {
      soft: "bg-accent-soft text-accent-strong",
      solid: "bg-accent text-white",
      outline: "border border-accent/40 text-accent-strong",
      dot: "bg-accent",
    },
    green: {
      soft: "bg-green-50 text-green-800",
      solid: "bg-green-700 text-white",
      outline: "border border-green-300 text-green-800",
      dot: "bg-green-600",
    },
    blue: {
      soft: "bg-blue-50 text-blue-800",
      solid: "bg-blue-700 text-white",
      outline: "border border-blue-300 text-blue-800",
      dot: "bg-blue-600",
    },
    amber: {
      soft: "bg-amber-50 text-amber-800",
      solid: "bg-amber-500 text-ink",
      outline: "border border-amber-300 text-amber-800",
      dot: "bg-amber-500",
    },
    red: {
      soft: "bg-red-50 text-red-800",
      solid: "bg-red-700 text-white",
      outline: "border border-red-300 text-red-800",
      dot: "bg-red-600",
    },
  };

  $: toneSet = TONES[tone] || TONES.neutral;
  $: sizeClass = size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
</script>

<span
  class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold {toneSet[variant] || toneSet.soft} {sizeClass} {className}"
>
  {#if dot}
    <span class="h-1.5 w-1.5 shrink-0 rounded-full {toneSet.dot}" aria-hidden="true"></span>
  {/if}
  <slot />
</span>
