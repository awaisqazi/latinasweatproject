<script>
  // "How to use this worksheet" and the ground rules, shared by all four
  // worksheets. Collapsed by default.
  import { GROUND_RULES, HOW_TO_STEPS } from "../../../../data/fundraisingWorksheets.js";

  export let open = false;
</script>

<details class="rounded-control border border-ink/8 bg-canvas/50 px-4 py-3" {open}>
  <summary class="cursor-pointer text-sm font-bold text-ink">How to use this worksheet</summary>
  <ol class="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-ink/80">
    {#each HOW_TO_STEPS as step (step.lead)}
      <li><span class="font-semibold text-ink">{step.lead}</span>{" "}{step.text}</li>
    {/each}
  </ol>
  <h5 class="mt-4 text-sm font-bold text-ink">Ground rules</h5>
  <ul class="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink/80">
    {#each GROUND_RULES as rule (rule)}
      <li>{rule}</li>
    {/each}
  </ul>
</details>
