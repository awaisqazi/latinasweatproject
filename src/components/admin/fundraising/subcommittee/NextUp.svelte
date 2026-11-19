<script>
  // A subcommittee tab's "Next up": the fundraising_attention lines for this
  // subcommittee, each a full-width tap target. Three or more overdue grant
  // next steps fold into one line that opens to list them. Hidden when the
  // RPC is missing or the account cannot read it.
  import { ChevronDown, ChevronRight } from "@lucide/svelte";
  import { attentionLines, dueLabel } from "../../../../lib/dashboard/fundraisingUpdates";
  import { chicagoToday } from "../../../../lib/dashboard/timeclock";

  export let committeeId = "";
  export let attention = null; // followUps.attention: { status, data }
  export let onOpenLine = () => {}; // (line) => void
  export let onOpenChild = () => {}; // (line) => void, one grant inside a group

  let expanded = {};

  $: status = attention?.status || "loading";
  $: data = attention?.data || null;
  $: today = data?.today || chicagoToday();
  $: lines = data ? attentionLines(data.items, committeeId, today) : [];
  $: hidden = status === "missing" || status === "forbidden" || (status === "error" && !data);
  $: headingId = `fundraising-${committeeId}-next-up`;

  function toggle(key) {
    expanded = { ...expanded, [key]: !expanded[key] };
  }
</script>

{#if !hidden}
  <section class="rounded-card border border-ink/8 bg-white p-4 shadow-card md:p-5" aria-labelledby={headingId}>
    <h4 id={headingId} class="text-base font-bold text-ink">Next up</h4>

    {#if !data}
      <p class="mt-2 text-sm text-ink/60">Checking what needs attention.</p>
    {:else if !lines.length}
      <p class="mt-2 text-sm text-ink/60">Nothing needs attention right now.</p>
    {:else}
      <ul class="mt-3 space-y-2">
        {#each lines as line (line.key)}
          <li>
            {#if line.children}
              <button
                type="button"
                class="flex min-h-12 w-full items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40"
                aria-expanded={Boolean(expanded[line.key])}
                onclick={() => toggle(line.key)}
              >
                <span class="min-w-0 flex-1">
                  <span class="block font-semibold leading-snug text-ink">{line.title}</span>
                  {#if line.detail}
                    <span class="mt-0.5 block text-sm text-red-700">{line.detail}</span>
                  {/if}
                </span>
                <ChevronDown class="h-4 w-4 shrink-0 text-ink/40 transition {expanded[line.key] ? 'rotate-180' : ''}" aria-hidden="true" />
              </button>
              {#if expanded[line.key]}
                <ul class="mt-2 space-y-2 pl-3">
                  {#each line.children as child (child.key)}
                    <li>
                      <button
                        type="button"
                        class="flex min-h-11 w-full items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-2.5 text-left transition hover:border-accent/40"
                        onclick={() => onOpenChild(child)}
                      >
                        <span class="min-w-0 flex-1">
                          <span class="block text-sm font-semibold leading-snug text-ink">{child.title}</span>
                          <span class="mt-0.5 block text-sm text-ink/60">
                            <span class="text-red-700">{dueLabel(child.dueOn, today)}</span>{#if child.detail}{". "}{child.detail}{/if}
                          </span>
                        </span>
                        <ChevronRight class="h-4 w-4 shrink-0 text-ink/40" aria-hidden="true" />
                      </button>
                    </li>
                  {/each}
                  <li>
                    <button
                      type="button"
                      class="min-h-11 w-full rounded-control px-4 text-left text-sm font-semibold text-ink/70 underline decoration-ink/20 underline-offset-2 hover:text-ink"
                      onclick={() => onOpenLine(line)}
                    >
                      Show only overdue grants in the pipeline
                    </button>
                  </li>
                </ul>
              {/if}
            {:else}
              <button
                type="button"
                class="flex min-h-12 w-full items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40"
                onclick={() => onOpenLine(line)}
              >
                <span class="min-w-0 flex-1">
                  <span class="block font-semibold leading-snug text-ink">{line.title}</span>
                  {#if line.dueOn || line.detail}
                    <span class="mt-0.5 block text-sm text-ink/60">
                      {#if line.dueOn}<span class={line.overdue ? "text-red-700" : ""}>{dueLabel(line.dueOn, today)}</span>{#if line.detail}{". "}{/if}{/if}{line.detail}
                    </span>
                  {/if}
                </span>
                <ChevronRight class="h-4 w-4 shrink-0 text-ink/40" aria-hidden="true" />
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}
