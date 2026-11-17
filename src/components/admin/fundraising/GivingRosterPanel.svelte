<script>
  // Every Giving Tuesday sign-up, pending first. Rows open the fundraiser
  // drawer for edits; pending rows can be approved straight from the list.
  import { Check, Plus, Search } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import GivingFundraiserDrawer from "./GivingFundraiserDrawer.svelte";
  import {
    FUNDRAISER_COLUMNS,
    cohortLabel,
    formatCents,
  } from "../../../lib/dashboard/givingAdmin";

  export let supabase;
  export let profile = null;
  export let campaign;
  export let fundraisers = [];
  export let totals = [];
  export let onChanged = () => {};

  const FILTERS = [
    { id: "all", label: "All" },
    { id: "pending", label: "Pending" },
    { id: "approved", label: "Approved" },
    { id: "hidden", label: "Hidden" },
  ];
  const STATUS_ORDER = { pending: 0, approved: 1, hidden: 2 };
  const STATUS_TONES = { pending: "amber", approved: "green", hidden: "neutral" };
  const STATUS_LABELS = { pending: "Pending", approved: "Approved", hidden: "Hidden" };

  let statusFilter = "all";
  let search = "";
  let selectedId = "";
  let createRequest = 0;
  let approvingId = "";
  let listError = "";

  $: totalsById = Object.fromEntries(totals.map((row) => [row.fundraiser_id, row]));
  $: counts = {
    all: fundraisers.length,
    pending: fundraisers.filter((row) => row.status === "pending").length,
    approved: fundraisers.filter((row) => row.status === "approved").length,
    hidden: fundraisers.filter((row) => row.status === "hidden").length,
  };
  $: visibleRows = filterRows(fundraisers, statusFilter, search);
  $: selectedFundraiser = fundraisers.find((row) => row.id === selectedId) || null;
  $: selectedTotals = selectedId ? totalsById[selectedId] || null : null;

  function filterRows(list, filter, query) {
    const q = query.trim().toLowerCase();
    return list
      .filter((row) => filter === "all" || row.status === filter)
      .filter((row) =>
        !q ||
        [row.display_name, row.email, row.phone, row.slug]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
      .slice()
      .sort(
        (a, b) =>
          (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
          (a.created_at || "").localeCompare(b.created_at || ""),
      );
  }

  function initials(name) {
    return String(name || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  async function quickApprove(row) {
    if (approvingId) return;
    approvingId = row.id;
    listError = "";
    const { data, error } = await supabase
      .from("giving_fundraisers")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: profile?.id || null,
      })
      .eq("id", row.id)
      .eq("updated_at", row.updated_at)
      .select(FUNDRAISER_COLUMNS)
      .maybeSingle();
    if (error) listError = error.message;
    else if (!data) listError = `${row.display_name} was changed by someone else just now. The list has been reloaded, try again.`;
    approvingId = "";
    await onChanged();
  }
</script>

<Panel title="Roster" id="giving-roster-title">
  <svelte:fragment slot="actions">
    <Button size="sm" icon={Plus} onclick={() => (createRequest += 1)}>Add a fundraiser</Button>
  </svelte:fragment>

  <div class="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Fundraiser status">
    {#each FILTERS as filter (filter.id)}
      <button
        type="button"
        class="rounded-full border px-3 py-1 text-xs font-bold transition {statusFilter === filter.id
          ? 'border-accent bg-accent/10 text-accent-strong'
          : 'border-ink/12 bg-white text-ink/60 hover:border-accent/40'}"
        aria-pressed={statusFilter === filter.id}
        onclick={() => (statusFilter = filter.id)}
      >
        {filter.label} ({counts[filter.id]})
      </button>
    {/each}
  </div>

  <label class="relative mb-4 block">
    <span class="sr-only">Search fundraisers</span>
    <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
    <input type="search" class="input pl-9" placeholder="Search by name, email, or phone" bind:value={search} />
  </label>

  {#if listError}
    <Banner tone="error" message={listError} class="mb-3" onDismiss={() => (listError = "")} />
  {/if}

  {#if visibleRows.length}
    <div class="space-y-2">
      {#each visibleRows as row (row.id)}
        {@const rowTotals = totalsById[row.id]}
        <div class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 transition hover:border-accent/40 hover:shadow-card">
          <button
            type="button"
            class="flex min-w-0 flex-1 basis-64 items-center gap-3 text-left"
            onclick={() => (selectedId = row.id)}
          >
            {#if row.avatar_slug}
              <img
                src={`/images/popup/instructors/${row.avatar_slug}-160.webp`}
                alt=""
                class="h-9 w-9 shrink-0 rounded-full bg-brand-soft object-cover"
                loading="lazy"
              />
            {:else}
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink" aria-hidden="true">
                {initials(row.display_name)}
              </span>
            {/if}
            <span class="min-w-0 flex-1">
              <span class="block truncate font-bold leading-snug text-ink">{row.display_name}</span>
              <span class="mt-0.5 block truncate text-xs text-ink/55">{row.email}</span>
            </span>
          </button>
          <span class="flex flex-wrap items-center gap-1.5">
            <Badge tone={STATUS_TONES[row.status] || "neutral"} size="xs">{STATUS_LABELS[row.status] || row.status}</Badge>
            <Badge tone="neutral" size="xs">{cohortLabel(row.cohort)}</Badge>
            {#if !row.show_on_board}
              <Badge tone="neutral" size="xs">Off the board</Badge>
            {/if}
            {#if row.status === "approved" && !row.zeffy_url}
              <Badge tone="amber" size="xs">No Zeffy page</Badge>
            {/if}
            {#if rowTotals?.reached}
              <Badge tone="gold" size="xs">Reached {formatCents(rowTotals.threshold_cents)}</Badge>
            {/if}
          </span>
          <span class="shrink-0 text-left sm:w-28 sm:text-right">
            <span class="block text-sm font-bold text-ink">{formatCents(rowTotals?.raised_cents || 0)}</span>
            <span class="block text-[11px] font-semibold text-ink/50">{formatCents(rowTotals?.eligible_cents || 0)} eligible</span>
          </span>
          {#if row.status === "pending"}
            <Button
              size="sm"
              variant="primary"
              icon={Check}
              loading={approvingId === row.id}
              disabled={Boolean(approvingId) && approvingId !== row.id}
              onclick={() => quickApprove(row)}
            >
              Approve
            </Button>
          {/if}
        </div>
      {/each}
    </div>
  {:else if fundraisers.length}
    <EmptyState title="No matching fundraisers" message="Try a different search or status." />
  {:else}
    <EmptyState
      title="No sign-ups yet"
      message="Instructors sign up at /givingtuesday/join. You can also add one by hand."
    />
  {/if}
</Panel>

<GivingFundraiserDrawer
  {supabase}
  {profile}
  {campaign}
  fundraiser={selectedFundraiser}
  totals={selectedTotals}
  {createRequest}
  onSaved={async (row) => {
    await onChanged();
    if (row?.id) selectedId = row.id;
  }}
  onClose={() => (selectedId = "")}
/>
