<script>
  // Every gift on the campaign, newest first: Zeffy-synced and offline.
  // Donor names and emails are staff-only and appear nowhere outside this tab.
  import { Plus, Search } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import GivingGiftDrawer from "./GivingGiftDrawer.svelte";
  import {
    PAYMENT_COLUMNS,
    formatCents,
    formatChicagoDateLabel,
    isRefunded,
    lockGiftQuery,
    netCents,
    paymentCounts,
    paymentStatusLabel,
  } from "../../../lib/dashboard/givingAdmin";

  export let supabase;
  export let profile = null;
  export let campaign;
  export let payments = [];
  export let fundraisers = [];
  export let onChanged = async () => {};

  const FILTERS = [
    { id: "all", label: "All" },
    { id: "unassigned", label: "Unassigned" },
    { id: "offline", label: "Offline" },
    { id: "refunded", label: "Refunded" },
  ];

  let filter = "all";
  let search = "";
  let selectedId = "";
  let createRequest = 0;
  let togglingId = "";
  let listError = "";

  $: fundraisersById = Object.fromEntries(fundraisers.map((row) => [row.id, row]));
  $: counts = {
    all: payments.length,
    unassigned: payments.filter((row) => !row.fundraiser_id).length,
    offline: payments.filter((row) => row.source === "offline").length,
    refunded: payments.filter((row) => isRefunded(row)).length,
  };
  $: visibleRows = filterRows(payments, filter, search);
  $: visibleNet = visibleRows
    .filter((row) => paymentCounts(row))
    .reduce((sum, row) => sum + netCents(row), 0);
  $: selectedPayment = payments.find((row) => row.id === selectedId) || null;

  function filterRows(list, which, query) {
    const q = query.trim().toLowerCase();
    return list.filter((row) => {
      if (which === "unassigned" && row.fundraiser_id) return false;
      if (which === "offline" && row.source !== "offline") return false;
      if (which === "refunded" && !isRefunded(row)) return false;
      if (!q) return true;
      return [row.buyer_first_name, row.buyer_last_name, row.buyer_email, row.note]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }

  function donorName(row) {
    return [row.buyer_first_name, row.buyer_last_name].filter(Boolean).join(" ");
  }

  async function toggleCounts(row, input) {
    const checked = input.checked;
    if (togglingId) {
      input.checked = !checked;
      return;
    }
    togglingId = row.id;
    listError = "";
    const { data, error } = await lockGiftQuery(
      supabase
        .from("giving_payments")
        .update({ counts_toward_threshold: checked })
        .eq("id", row.id),
      row,
    )
      .select(PAYMENT_COLUMNS)
      .maybeSingle();
    if (error || !data) input.checked = !checked;
    if (error) listError = error.message;
    else if (!data) listError = "That gift was changed by someone else or by a sync just now. The list has been reloaded, try again.";
    togglingId = "";
    await onChanged();
  }
</script>

<Panel title="Gifts" id="giving-gifts-title">
  <svelte:fragment slot="actions">
    <Button size="sm" icon={Plus} onclick={() => (createRequest += 1)}>Add offline gift</Button>
  </svelte:fragment>

  <div class="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Gift filters">
    {#each FILTERS as option (option.id)}
      <button
        type="button"
        class="rounded-full border px-3 py-1 text-xs font-bold transition {filter === option.id
          ? 'border-accent bg-accent/10 text-accent-strong'
          : 'border-ink/12 bg-white text-ink/60 hover:border-accent/40'}"
        aria-pressed={filter === option.id}
        onclick={() => (filter = option.id)}
      >
        {option.label} ({counts[option.id]})
      </button>
    {/each}
  </div>

  <label class="relative mb-4 block">
    <span class="sr-only">Search gifts</span>
    <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
    <input type="search" class="input pl-9" placeholder="Search by donor name, email, or note" bind:value={search} />
  </label>

  {#if listError}
    <Banner tone="error" message={listError} class="mb-3" onDismiss={() => (listError = "")} />
  {/if}

  <p class="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
    {visibleRows.length.toLocaleString()} of {payments.length.toLocaleString()} gifts · {formatCents(visibleNet)} net
  </p>

  {#if visibleRows.length}
    <div class="space-y-2">
      {#each visibleRows as row (row.id)}
        {@const credited = row.fundraiser_id ? fundraisersById[row.fundraiser_id] : null}
        <div class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 transition hover:border-accent/40 hover:shadow-card">
          <button
            type="button"
            class="flex min-w-0 flex-1 basis-64 flex-col text-left"
            onclick={() => (selectedId = row.id)}
          >
            <span class="block truncate font-bold leading-snug text-ink">
              {donorName(row) || row.buyer_email || "Anonymous donor"}
            </span>
            <span class="mt-0.5 block truncate text-xs text-ink/55">
              {formatChicagoDateLabel(row.paid_at)}{donorName(row) && row.buyer_email ? ` · ${row.buyer_email}` : ""}
            </span>
            <span class="mt-0.5 block truncate text-xs text-ink/55">
              {credited ? `Credited to ${credited.display_name}` : "Main page, not credited"}{row.note ? ` · ${row.note}` : ""}
            </span>
          </button>
          <span class="flex flex-wrap items-center gap-1.5">
            <Badge tone={row.source === "offline" ? "blue" : "neutral"} size="xs">
              {row.source === "offline" ? "Offline" : "Zeffy"}
            </Badge>
            {#if row.status !== "succeeded"}
              <Badge tone={row.status === "pending" ? "amber" : "red"} size="xs">{paymentStatusLabel(row.status)}</Badge>
            {/if}
            {#if isRefunded(row)}
              <Badge tone="amber" size="xs">Refunded {formatCents(row.refunded_cents)}</Badge>
            {/if}
          </span>
          <label class="flex items-center gap-2 text-xs font-semibold text-ink/65">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent"
              checked={row.counts_toward_threshold}
              disabled={Boolean(togglingId)}
              onchange={(event) => toggleCounts(row, event.currentTarget)}
            />
            Counts toward {formatCents(campaign.threshold_cents)}
          </label>
          <span class="w-24 shrink-0 text-right">
            <span class="block text-sm font-bold text-ink">{formatCents(netCents(row))}</span>
            {#if isRefunded(row)}
              <span class="block text-[11px] font-semibold text-ink/50">of {formatCents(row.amount_cents)}</span>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  {:else if payments.length}
    <EmptyState title="No matching gifts" message="Try a different filter or search." />
  {:else}
    <EmptyState title="No gifts yet" message="Zeffy gifts appear here after each sync. Cash, checks and other offline gifts can be added by hand." />
  {/if}
</Panel>

<GivingGiftDrawer
  {supabase}
  {profile}
  {campaign}
  payment={selectedPayment}
  {fundraisers}
  {createRequest}
  onSaved={async (row) => {
    await onChanged();
    if (row?.id) selectedId = row.id;
  }}
  onDeleted={async () => {
    selectedId = "";
    await onChanged();
  }}
  onClose={() => (selectedId = "")}
/>
