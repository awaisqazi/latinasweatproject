<script>
  // Donor Engagement > Thank-yous: every gift from the last 60 days that
  // nobody has marked as thanked, newest first (fundraising_thanks_queue).
  // One "Thanked" button per gift marks it at once and offers Undo for a few
  // seconds, with an optional way to record how. A one-time bulk mark clears
  // gifts older than a week so the list can start from a workable size.
  // Donor names and emails are staff-only and stay in the dashboard.
  import { onDestroy } from "svelte";
  import Banner from "../ui/Banner.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import { formatMoney } from "../../../lib/dashboard/fundraising";
  import {
    BULK_NOTE,
    BULK_OLDER_THAN_DAYS,
    THANKS_FILTERS,
    THANK_METHODS,
    adjustedThanksCounts,
    filterThanks,
    markThanked,
    methodLabel,
    olderThan,
    setThanksMethod,
    unmarkThanked,
    visibleThanks,
    waitedLabel,
  } from "../../../lib/dashboard/fundraisingThanks";

  export let supabase;
  export let profile = null;
  export let teamMembers = [];
  export let thanks = null; // followUps.thanks: { status, data, error }
  export let onChanged = () => {}; // ask FollowUpData to reload
  export let onOpenDonorEmail = () => {};

  const PAGE = 50;
  const UNDO_MS = 7000;

  let filter = "all";
  let shown = PAGE;
  let hidden = new Set(); // marked here, not yet gone from a reload
  let restored = []; // un-marked here, not yet back from a reload
  let errorMessage = "";
  let undo = null; // { ids, items, label, method, bulk }
  let undoTimer = 0;
  let bulkOpen = false;
  let bulkBusy = false;
  let lastData = null;

  $: status = thanks?.status || "loading";
  $: queue = thanks?.data || null;
  $: if (queue !== lastData) {
    lastData = queue;
    reconcile(queue);
  }
  $: items = visibleThanks(queue?.items || [], hidden, restored);
  $: counts = adjustedThanksCounts(queue, hidden, restored);
  $: filtered = filterThanks(items, filter, profile?.id || "");
  $: page = filtered.slice(0, shown);
  $: bulkItems = olderThan(items, BULK_OLDER_THAN_DAYS);
  $: membersById = Object.fromEntries((teamMembers || []).map((member) => [member.id, member]));
  $: truncated = queue ? Math.max(0, counts.waiting - items.length) : 0;

  onDestroy(() => {
    if (typeof window !== "undefined") window.clearTimeout(undoTimer);
  });

  // A reload that no longer lists a marked gift (or lists an un-marked one
  // again) has caught up, so the local adjustment can go.
  function reconcile(data) {
    if (!data) return;
    const ids = new Set(data.items.map((item) => item.paymentId));
    const nextHidden = new Set([...hidden].filter((id) => ids.has(id)));
    if (nextHidden.size !== hidden.size) hidden = nextHidden;
    const nextRestored = restored.filter((item) => !ids.has(item.paymentId));
    if (nextRestored.length !== restored.length) restored = nextRestored;
  }

  function donorLabel(item) {
    return item.name || item.email || "Anonymous donor";
  }

  function ownerText(item) {
    if (!item.ownerId) return "No owner";
    const owner = membersById[item.ownerId];
    if (profile?.id && item.ownerId === profile.id) return "Owner: you";
    return `Owner: ${owner?.full_name || owner?.email || "set"}`;
  }

  function showUndo(next) {
    window.clearTimeout(undoTimer);
    undo = next;
    undoTimer = window.setTimeout(() => (undo = null), UNDO_MS);
  }

  function keepUndoOpen() {
    window.clearTimeout(undoTimer);
    undoTimer = window.setTimeout(() => (undo = null), UNDO_MS);
  }

  async function markOne(item) {
    if (hidden.has(item.paymentId)) return;
    errorMessage = "";
    hidden = new Set(hidden).add(item.paymentId);
    restored = restored.filter((row) => row.paymentId !== item.paymentId);
    const token = { ids: [item.paymentId], items: [item], label: `Marked ${donorLabel(item)} as thanked.`, method: "", bulk: false };
    token.pending = markThanked(supabase, [item.paymentId]);
    showUndo(token);
    const { error } = await token.pending;
    if (error) {
      const next = new Set(hidden);
      next.delete(item.paymentId);
      hidden = next;
      if (undo === token) undo = null;
      errorMessage = `Could not mark ${donorLabel(item)} as thanked. Try again.`;
      return;
    }
    onChanged();
  }

  async function markBulk() {
    const targets = bulkItems;
    if (!targets.length || bulkBusy) return;
    bulkBusy = true;
    errorMessage = "";
    const ids = targets.map((item) => item.paymentId);
    const { count, error } = await markThanked(supabase, ids, null, BULK_NOTE);
    bulkBusy = false;
    bulkOpen = false;
    if (error) {
      errorMessage = "Could not mark those gifts as thanked. Nothing was changed. Try again.";
      return;
    }
    hidden = new Set([...hidden, ...ids]);
    restored = restored.filter((row) => !ids.includes(row.paymentId));
    const n = count || ids.length;
    showUndo({ ids, items: targets, label: `Marked ${n.toLocaleString("en-US")} older gift${n === 1 ? "" : "s"} as thanked.`, method: "", bulk: true });
    onChanged();
  }

  async function undoLast() {
    const token = undo;
    if (!token) return;
    window.clearTimeout(undoTimer);
    undo = null;
    errorMessage = "";
    const next = new Set(hidden);
    for (const id of token.ids) next.delete(id);
    hidden = next;
    restored = [...restored.filter((row) => !token.ids.includes(row.paymentId)), ...token.items];
    // An Undo tapped before the mark finished waits for it, so the delete
    // cannot land first and leave the gift marked.
    if (token.pending) await token.pending;
    const { error } = await unmarkThanked(supabase, token.ids);
    if (error) {
      hidden = new Set([...hidden, ...token.ids]);
      restored = restored.filter((row) => !token.ids.includes(row.paymentId));
      errorMessage = "Could not undo. The gift is still marked as thanked.";
      return;
    }
    onChanged();
  }

  async function recordMethod(event) {
    const token = undo;
    const value = event.currentTarget.value;
    if (!token) return;
    keepUndoOpen();
    token.method = value;
    undo = token;
    if (token.pending) await token.pending;
    const { error } = await setThanksMethod(supabase, token.ids, value);
    if (error) {
      errorMessage = "Could not save how the donor was thanked. The gift is still marked as thanked.";
    }
  }
</script>

<Panel title="Thank-yous" id="fundraising-thanks-title">
  {#if status === "missing"}
    <p class="text-sm text-ink/60">The thank-you tracker is not set up yet.</p>
  {:else if status === "forbidden"}
    <p class="text-sm text-ink/60">Your account does not have access to the thank-you tracker.</p>
  {:else if status === "error" && !queue}
    <p class="text-sm text-ink/60">The thank-you list could not be loaded. It will try again on the next refresh.</p>
  {:else if !queue}
    <p class="text-sm text-ink/60">Loading the gifts waiting for a thank-you.</p>
  {:else}
    <p class="-mt-2 text-sm leading-6 text-ink/70">
      <span class="font-semibold text-ink">{counts.waiting.toLocaleString("en-US")} waiting</span>,
      {counts.overdue.toLocaleString("en-US")} of them for more than a week.
      {counts.thanked.toLocaleString("en-US")} thanked in the last 30 days.
    </p>
    <p class="mt-1 text-xs text-ink/50">
      Gifts and peer-to-peer gifts from the last {queue.windowDays} days. Tickets and shop sales are not listed.
    </p>

    {#if thanks?.error}
      <p class="mt-2 text-xs text-ink/50">{thanks.error}</p>
    {/if}
    {#if errorMessage}
      <Banner tone="error" message={errorMessage} class="mt-3" />
    {/if}

    {#if bulkItems.length}
      <div class="mt-4 rounded-control bg-canvas px-4 py-3">
        <p class="text-sm text-ink/70">
          {bulkItems.length === 1 ? "1 of these gifts has" : `${bulkItems.length.toLocaleString("en-US")} of these gifts have`} waited more than {BULK_OLDER_THAN_DAYS} days. If they were thanked before this tracker existed, mark them all at once and start from this week.
        </p>
        <button
          type="button"
          class="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-control border border-ink/14 bg-white px-4 text-sm font-semibold text-ink shadow-card hover:border-ink/30 sm:w-auto"
          onclick={() => (bulkOpen = true)}
        >
          Mark everything older than {BULK_OLDER_THAN_DAYS} days as thanked
        </button>
      </div>
    {/if}

    <div class="mt-4 flex gap-1 rounded-control border border-ink/10 bg-ink/[0.04] p-1" role="group" aria-label="Show gifts">
      {#each THANKS_FILTERS as option (option.id)}
        <button
          type="button"
          class="inline-flex min-h-11 flex-1 items-center justify-center rounded-[6px] px-3 text-sm font-semibold transition-colors {filter === option.id ? 'bg-white text-ink shadow-card' : 'text-ink/55 hover:text-ink'}"
          aria-pressed={filter === option.id}
          onclick={() => {
            filter = option.id;
            shown = PAGE;
          }}
        >
          {option.label}
        </button>
      {/each}
    </div>

    {#if truncated && filter === "all"}
      <p class="mt-3 text-xs text-ink/50">
        Showing the newest {items.length.toLocaleString("en-US")}. {truncated.toLocaleString("en-US")} older gift{truncated === 1 ? "" : "s"} will show as these are marked.
      </p>
    {/if}

    {#if filtered.length}
      <ul class="mt-3 space-y-2">
        {#each page as item (item.paymentId)}
          <li class="flex items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline justify-between gap-2">
                {#if item.email}
                  <button
                    type="button"
                    class="min-w-0 truncate text-left font-bold leading-snug text-ink underline decoration-ink/20 underline-offset-2 hover:decoration-ink/60"
                    onclick={() => onOpenDonorEmail(item.email)}
                  >
                    {donorLabel(item)}
                  </button>
                {:else}
                  <span class="min-w-0 truncate font-bold leading-snug text-ink">{donorLabel(item)}</span>
                {/if}
                <span class="shrink-0 text-sm font-bold tabular-nums text-ink">{formatMoney(item.amountCents / 100)}</span>
              </div>
              <p class="mt-0.5 truncate text-sm text-ink/60">{item.campaignTitle || "No campaign"}</p>
              <p class="mt-0.5 text-sm text-ink/60">
                <span class={item.overdue ? "font-semibold text-red-700" : ""}>
                  {item.daysWaiting === 0 ? "Gave today" : `Waiting ${waitedLabel(item.daysWaiting)}`}
                </span>
                {" • "}{ownerText(item)}{#if item.donorGiftCount === 1}{" • First gift"}{/if}
              </p>
            </div>
            <button
              type="button"
              class="inline-flex min-h-11 min-w-[6.5rem] shrink-0 items-center justify-center rounded-control border border-transparent bg-brand px-4 text-sm font-semibold text-ink shadow-card hover:bg-brand-strong"
              aria-label={`Mark the gift from ${donorLabel(item)} as thanked`}
              onclick={() => markOne(item)}
            >
              Thanked
            </button>
          </li>
        {/each}
      </ul>
      {#if filtered.length > shown}
        <button
          type="button"
          class="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-control px-4 text-sm font-semibold text-ink/70 hover:bg-ink/[0.06] hover:text-ink"
          onclick={() => (shown += PAGE)}
        >
          Show {Math.min(PAGE, filtered.length - shown)} more of {filtered.length.toLocaleString("en-US")}
        </button>
      {/if}
    {:else if filter === "mine"}
      <div class="mt-3">
        <EmptyState title="No gifts from your donors" message="Gifts from donors you own show here. Owners are set in each donor's profile." />
      </div>
    {:else if filter === "overdue"}
      <div class="mt-3">
        <EmptyState title="Nothing overdue" message="Every gift waiting has come in within the last week." />
      </div>
    {:else}
      <div class="mt-3">
        <EmptyState title="All caught up" message="Every gift from the last 60 days has been thanked." />
      </div>
    {/if}
  {/if}
</Panel>

{#if undo}
  <div class="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md rounded-card bg-ink p-3 text-white shadow-pop" role="status" aria-live="polite">
    <div class="flex items-center gap-3">
      <p class="min-w-0 flex-1 text-sm leading-snug">{undo.label}</p>
      <button
        type="button"
        class="inline-flex min-h-11 shrink-0 items-center rounded-control border border-white/30 px-4 text-sm font-semibold text-white hover:bg-white/10"
        onclick={undoLast}
      >
        Undo
      </button>
    </div>
    {#if !undo.bulk}
      <label class="mt-2 flex items-center gap-2 text-sm text-white/80">
        <span class="shrink-0">How?</span>
        <select
          class="min-h-11 min-w-0 flex-1 rounded-control border border-white/30 bg-ink px-3 text-sm text-white"
          value={undo.method}
          onfocus={keepUndoOpen}
          onchange={recordMethod}
        >
          <option value="">Not recorded</option>
          {#each THANK_METHODS as method (method.value)}
            <option value={method.value}>{method.label}</option>
          {/each}
        </select>
      </label>
      {#if undo.method}
        <p class="mt-1 text-xs text-white/70">Recorded as {methodLabel(undo.method).toLowerCase()}.</p>
      {/if}
    {/if}
  </div>
{/if}

<ConfirmDialog
  open={bulkOpen}
  title={`Mark ${bulkItems.length.toLocaleString("en-US")} gift${bulkItems.length === 1 ? "" : "s"} as thanked?`}
  confirmLabel={`Mark ${bulkItems.length.toLocaleString("en-US")} as thanked`}
  tone="primary"
  busy={bulkBusy}
  onConfirm={markBulk}
  onCancel={() => (bulkOpen = false)}
>
  <p>
    This marks the {bulkItems.length.toLocaleString("en-US")} gift{bulkItems.length === 1 ? " that has" : "s that have"} waited more than {BULK_OLDER_THAN_DAYS} days as thanked, so the list keeps only the last month. You can undo it right after.
  </p>
</ConfirmDialog>
