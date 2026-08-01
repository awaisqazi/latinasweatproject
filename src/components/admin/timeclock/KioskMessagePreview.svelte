<script>
  // Roughly how the studio iPad renders a check-in message: a dark card with
  // the gold foil accent and a megaphone, shown to staff right after they tap
  // their card. Authors get this live so they can see line breaks and length
  // before anyone else does.
  import { Megaphone } from "@lucide/svelte";
  import { AUDIENCE_LABELS } from "../../../lib/dashboard/timeclock";

  export let title = "";
  export let body = "";
  export let audience = "all";
  export let personName = "";

  $: audienceLabel = personName || AUDIENCE_LABELS[audience] || "Everyone";
</script>

<div class="rounded-card bg-ink p-4 text-white shadow-pop">
  <div class="flex items-start gap-3">
    <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-ink">
      <Megaphone class="h-4.5 w-4.5" aria-hidden="true" />
    </span>
    <div class="min-w-0 flex-1">
      <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
        {audienceLabel}
      </p>
      <p class="mt-1 text-lg font-bold leading-tight">
        {title || "Untitled message"}
      </p>
      <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/80">
        {body || "Your message body shows up here."}
      </p>
    </div>
  </div>
  <div class="mt-4 border-t border-white/15 pt-3">
    <span class="inline-flex items-center rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-ink">
      Got it
    </span>
  </div>
</div>
