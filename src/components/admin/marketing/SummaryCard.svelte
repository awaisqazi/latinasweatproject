<script>
  export let label;
  export let value = 0;
  export let icon;
  export let tone = "gold";

  $: toneClass =
    tone === "teal"
      ? "bg-teal-50 text-teal-700"
      : tone === "rose"
        ? "bg-red-50 text-red-700"
        : "bg-[#fff3d8] text-[#8a5700]";
</script>

<article class="rounded-md border border-black/10 bg-white p-4 shadow-sm">
  <div class="flex items-center justify-between gap-3">
    <div>
      <p class="text-sm font-semibold text-gray-600">{label}</p>
      <p class="mt-2 text-3xl font-bold">{value}</p>
    </div>
    <span class="flex h-11 w-11 items-center justify-center rounded-md {toneClass}">
      <svelte:component this={icon} class="h-5 w-5" aria-hidden="true" />
    </span>
  </div>
</article>
