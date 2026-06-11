<script>
  import { CircleAlert, CircleCheck, Info, TriangleAlert } from "@lucide/svelte";
  import Button from "./Button.svelte";

  // One banner for the ~20 hand-rolled alert blocks across the portal.
  export let tone = "error"; // error | success | warning | info
  export let message = "";
  export let onDismiss = null;
  export let onRetry = null;
  export let retryLabel = "Try again";
  let className = "";
  export { className as class };

  const TONES = {
    error: { wrap: "border-red-200 bg-red-50 text-red-800", icon: CircleAlert },
    success: { wrap: "border-green-200 bg-green-50 text-green-800", icon: CircleCheck },
    warning: { wrap: "border-amber-200 bg-amber-50 text-amber-800", icon: TriangleAlert },
    info: { wrap: "border-blue-200 bg-blue-50 text-blue-800", icon: Info },
  };

  $: toneSet = TONES[tone] || TONES.error;
  $: role = tone === "error" || tone === "warning" ? "alert" : "status";
</script>

<div class="flex items-start gap-2.5 rounded-control border px-3.5 py-3 text-sm {toneSet.wrap} {className}" {role}>
  <svelte:component this={toneSet.icon} class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
  <div class="min-w-0 flex-1 leading-5">
    {#if message}{message}{:else}<slot />{/if}
    {#if onRetry}
      <button
        type="button"
        class="ml-2 font-semibold underline underline-offset-2 hover:no-underline"
        onclick={onRetry}
      >
        {retryLabel}
      </button>
    {/if}
  </div>
  {#if onDismiss}
    <button
      type="button"
      class="-m-1.5 grid h-6 w-6 place-items-center rounded opacity-60 transition hover:opacity-100"
      aria-label="Dismiss"
      onclick={onDismiss}
    >
      <svg class="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 2l10 10M12 2L2 12" /></svg>
    </button>
  {/if}
</div>
