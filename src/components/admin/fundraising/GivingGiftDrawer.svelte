<script>
  // One gift. Zeffy gifts: only the credited fundraiser, the counts-toward
  // flag and the note change here (the sync owns the amount and never touches
  // those three). Offline gifts (cash, check, Venmo, employer match) are fully
  // editable and deletable, and are stored the way the backend contract says
  // so the public total counts them: source 'offline', status 'succeeded'.
  import { Save, Trash2 } from "@lucide/svelte";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Field from "../ui/Field.svelte";
  import {
    PAYMENT_COLUMNS,
    centsToInput,
    chicagoDateToIso,
    formatCents,
    formatChicagoDate,
    formatChicagoDateTimeLabel,
    isRefunded,
    lockGiftQuery,
    netCents,
    oneLine,
    parseDollarsToCents,
    paymentStatusLabel,
    todayChicago,
  } from "../../../lib/dashboard/givingAdmin";

  export let supabase;
  export let profile = null;
  export let campaign;
  export let payment = null;
  export let fundraisers = [];
  export let createRequest = 0;
  export let onSaved = async () => {};
  export let onDeleted = async () => {};
  export let onClose = () => {};

  const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const STATUS_ORDER = { approved: 0, pending: 1, hidden: 2 };
  const CONFLICT_MESSAGE =
    "This gift was just changed by someone else or by a Zeffy sync, so the latest version has been loaded. Please re-apply your change.";

  let displayed = null;
  let drawerOpen = false;
  let isCreating = false;
  let lastCreateRequest = createRequest;
  let isSaving = false;
  let isDeleting = false;
  let confirmingDelete = false;
  let errorMessage = "";
  let successMessage = "";

  let draftFundraiserId = "";
  let draftCounts = true;
  let draftNote = "";
  let draftAmount = "";
  let draftDate = "";
  let draftFirst = "";
  let draftLast = "";
  let draftEmail = "";

  $: if (payment?.id && payment.id !== displayed?.id) {
    openFor(payment);
  }
  $: if (createRequest !== lastCreateRequest) {
    lastCreateRequest = createRequest;
    openForCreate();
  }
  $: isOffline = isCreating || displayed?.source === "offline";
  $: fundraiserOptions = fundraisers
    .slice()
    .sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
        a.display_name.localeCompare(b.display_name),
    );
  $: isDirty = isCreating || (Boolean(displayed) &&
    ((draftFundraiserId || null) !== (displayed.fundraiser_id || null) ||
      draftCounts !== Boolean(displayed.counts_toward_threshold) ||
      (draftNote.trim() || null) !== (displayed.note || null) ||
      (isOffline &&
        (parseDollarsToCents(draftAmount) !== Number(displayed.amount_cents) ||
          draftDate !== formatChicagoDate(displayed.paid_at) ||
          (oneLine(draftFirst) || null) !== (displayed.buyer_first_name || null) ||
          (oneLine(draftLast) || null) !== (displayed.buyer_last_name || null) ||
          (draftEmail.trim().toLowerCase() || null) !== (displayed.buyer_email || null)))));
  $: draftFundraiser = draftFundraiserId ? fundraisers.find((row) => row.id === draftFundraiserId) : null;
  $: selfGiftWarning =
    Boolean(draftFundraiser) &&
    Boolean(draftEmail.trim() || displayed?.buyer_email) &&
    (isOffline ? draftEmail.trim().toLowerCase() : String(displayed?.buyer_email || "").toLowerCase()) ===
      String(draftFundraiser?.email || "").toLowerCase();

  function seedDrafts(row) {
    draftFundraiserId = row.fundraiser_id || "";
    draftCounts = row.counts_toward_threshold !== false;
    draftNote = row.note || "";
    draftAmount = row.amount_cents ? centsToInput(row.amount_cents) : "";
    draftDate = row.paid_at ? formatChicagoDate(row.paid_at) : todayChicago();
    draftFirst = row.buyer_first_name || "";
    draftLast = row.buyer_last_name || "";
    draftEmail = row.buyer_email || "";
  }

  function openFor(row) {
    displayed = row;
    isCreating = false;
    errorMessage = "";
    successMessage = "";
    seedDrafts(row);
    drawerOpen = true;
  }

  function openForCreate() {
    displayed = null;
    isCreating = true;
    errorMessage = "";
    successMessage = "";
    seedDrafts({ counts_toward_threshold: true });
    drawerOpen = true;
  }

  function requestClose() {
    if (isSaving || isDeleting) return;
    drawerOpen = false;
  }

  function handleClosed() {
    drawerOpen = false;
    displayed = null;
    isCreating = false;
    onClose();
  }

  function buildOfflineFields() {
    const amount = parseDollarsToCents(draftAmount);
    if (!amount) return { error: "Enter the amount in dollars, for example 50 or 25.50." };
    const paidAt = chicagoDateToIso(draftDate);
    if (!paidAt) return { error: "Pick the date of the gift." };
    const email = draftEmail.trim().toLowerCase();
    if (email && (!EMAIL_RE.test(email) || email.length > 200)) {
      return { error: "That donor email does not look right. Leave it blank if you do not have one." };
    }
    const first = oneLine(draftFirst).slice(0, 60);
    const last = oneLine(draftLast).slice(0, 60);
    return {
      fields: {
        amount_cents: amount,
        paid_at: paidAt,
        buyer_first_name: first || null,
        buyer_last_name: last || null,
        buyer_email: email || null,
      },
    };
  }

  async function save(event) {
    event?.preventDefault();
    if (isSaving) return;
    errorMessage = "";
    successMessage = "";

    const note = draftNote.trim().slice(0, 500) || null;
    const shared = {
      fundraiser_id: draftFundraiserId || null,
      counts_toward_threshold: draftCounts,
      note,
    };

    let offline = null;
    if (isOffline) {
      offline = buildOfflineFields();
      if (offline.error) {
        errorMessage = offline.error;
        return;
      }
    }

    isSaving = true;
    let result;
    if (isCreating) {
      result = await supabase
        .from("giving_payments")
        .insert({
          campaign_slug: campaign.slug,
          source: "offline",
          status: "succeeded",
          refund_status: "none",
          refunded_cents: 0,
          entered_by: profile?.id || null,
          ...offline.fields,
          ...shared,
        })
        .select(PAYMENT_COLUMNS)
        .maybeSingle();
    } else {
      result = await lockGiftQuery(
        supabase
          .from("giving_payments")
          .update(offline ? { ...offline.fields, ...shared } : shared)
          .eq("id", displayed.id),
        displayed,
      )
        .select(PAYMENT_COLUMNS)
        .maybeSingle();
    }

    const { data, error } = result;
    if (error) {
      errorMessage = error.message;
    } else if (!data) {
      errorMessage = CONFLICT_MESSAGE;
      const { data: fresh } = await supabase
        .from("giving_payments")
        .select(PAYMENT_COLUMNS)
        .eq("id", displayed.id)
        .maybeSingle();
      if (fresh) {
        displayed = fresh;
        seedDrafts(fresh);
      }
    } else {
      const wasCreating = isCreating;
      isCreating = false;
      displayed = data;
      seedDrafts(data);
      successMessage = wasCreating ? `Offline gift of ${formatCents(data.amount_cents)} added.` : "Saved.";
      isSaving = false;
      await onSaved(data);
      return;
    }
    isSaving = false;
  }

  async function deleteGift() {
    if (!displayed?.id || displayed.source !== "offline" || isDeleting) return;
    isDeleting = true;
    errorMessage = "";
    const { data, error } = await supabase
      .from("giving_payments")
      .delete()
      .eq("id", displayed.id)
      .eq("source", "offline")
      .select("id");
    isDeleting = false;
    confirmingDelete = false;
    if (error || !data?.length) {
      errorMessage = error?.message || "This gift could not be deleted. It may already be gone.";
      return;
    }
    drawerOpen = false;
    await onDeleted(displayed.id);
  }
</script>

<SlideOver
  open={drawerOpen}
  title={isCreating ? "Add offline gift" : displayed ? formatCents(netCents(displayed)) : ""}
  eyebrow={isCreating ? "Giving Tuesday" : displayed?.source === "offline" ? "Offline gift" : "Zeffy gift"}
  closeLabel="Close gift"
  closeDisabled={isSaving || isDeleting}
  onClose={requestClose}
  onClosed={handleClosed}
>
  <div class="px-5 py-5">
    {#if errorMessage}
      <Banner tone="error" message={errorMessage} class="mb-4" />
    {/if}
    {#if successMessage}
      <Banner tone="success" message={successMessage} class="mb-4" />
    {/if}

    {#if displayed && !isCreating}
      <div class="flex flex-wrap gap-2">
        <Badge tone={displayed.source === "offline" ? "blue" : "neutral"}>
          {displayed.source === "offline" ? "Offline" : "Zeffy"}
        </Badge>
        <Badge tone={displayed.status === "succeeded" ? "green" : displayed.status === "pending" ? "amber" : "red"}>{paymentStatusLabel(displayed.status)}</Badge>
        {#if isRefunded(displayed)}
          <Badge tone="amber">Refunded {formatCents(displayed.refunded_cents)} of {formatCents(displayed.amount_cents)}</Badge>
        {/if}
      </div>

      {#if displayed.source === "zeffy"}
        <section class="mt-5 rounded-control border border-ink/8 bg-white p-4">
          <h4 class="font-bold text-ink">From Zeffy</h4>
          <dl class="mt-3 space-y-3">
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Gift · net of refunds</dt>
              <dd class="mt-1 text-sm text-ink/80">{formatCents(displayed.amount_cents)} · {formatCents(netCents(displayed))}</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Paid (Chicago time)</dt>
              <dd class="mt-1 text-sm text-ink/80">{formatChicagoDateTimeLabel(displayed.paid_at)}</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Donor</dt>
              <dd class="mt-1 break-all text-sm text-ink/80">
                {[displayed.buyer_first_name, displayed.buyer_last_name].filter(Boolean).join(" ") || "No name"}
                {#if displayed.buyer_email} · {displayed.buyer_email}{/if}
              </dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Zeffy payment id</dt>
              <dd class="mt-1 break-all font-mono text-xs text-ink/70">{displayed.zeffy_payment_id}</dd>
            </div>
          </dl>
          <p class="mt-3 text-xs text-ink/50">The amount comes from Zeffy and cannot be changed here.</p>
        </section>
      {/if}
    {/if}

    <form class="mt-5 space-y-4" onsubmit={save}>
      {#if isOffline}
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (dollars)" id="gg-amount" required>
            <input id="gg-amount" class="input" inputmode="decimal" placeholder="50" bind:value={draftAmount} disabled={isSaving} />
          </Field>
          <Field label="Date" id="gg-date" required hint="Chicago date">
            <input id="gg-date" type="date" class="input" bind:value={draftDate} disabled={isSaving} />
          </Field>
          <Field label="Donor first name" id="gg-first">
            <input id="gg-first" class="input" maxlength="60" bind:value={draftFirst} disabled={isSaving} />
          </Field>
          <Field label="Donor last name" id="gg-last">
            <input id="gg-last" class="input" maxlength="60" bind:value={draftLast} disabled={isSaving} />
          </Field>
          <Field label="Donor email" id="gg-email" class="sm:col-span-2" hint="Optional. Staff only, never shown publicly.">
            <input id="gg-email" type="email" class="input" maxlength="200" bind:value={draftEmail} disabled={isSaving} />
          </Field>
        </div>
      {/if}

      <Field label="Credited to" id="gg-fundraiser">
        <select id="gg-fundraiser" class="select" bind:value={draftFundraiserId} disabled={isSaving}>
          <option value="">Main page, not credited</option>
          {#each fundraiserOptions as row (row.id)}
            <option value={row.id}>{row.display_name}{row.status === "approved" ? "" : ` (${row.status})`}</option>
          {/each}
        </select>
      </Field>
      {#if selfGiftWarning}
        <Banner tone="info" message="The donor email matches this fundraiser, so it counts as their own gift and stays out of the drawing total." />
      {/if}

      <label class="flex items-start gap-3 text-sm">
        <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent" bind:checked={draftCounts} disabled={isSaving} />
        <span>
          <span class="block font-semibold text-ink">Counts toward {formatCents(campaign?.threshold_cents || 0)}</span>
          <span class="block text-xs text-ink/55">Untick to keep it in the totals but out of the drawing, and say why in the note.</span>
        </span>
      </label>

      <Field label="Note" id="gg-note" hint="Staff only. For example: cash at the studio, check 1042, employer match.">
        <textarea id="gg-note" class="textarea" rows="2" maxlength="500" bind:value={draftNote} disabled={isSaving}></textarea>
      </Field>

      <div class="flex justify-end gap-2">
        {#if isCreating}
          <Button variant="ghost" disabled={isSaving} onclick={requestClose}>Cancel</Button>
        {/if}
        <Button variant="primary" type="submit" icon={Save} loading={isSaving} disabled={!isDirty}>
          {isCreating ? "Add gift" : "Save changes"}
        </Button>
      </div>
    </form>

    {#if displayed && !isCreating && displayed.source === "offline"}
      <section class="mt-5 rounded-control border border-red-200 bg-red-50/50 p-4">
        <h4 class="font-bold text-red-800">Delete this offline gift</h4>
        <p class="mt-1 text-xs text-red-800/80">Only for a gift keyed by mistake. It comes off the public total.</p>
        <Button variant="danger" icon={Trash2} class="mt-3" loading={isDeleting} onclick={() => (confirmingDelete = true)}>
          Delete gift
        </Button>
      </section>
    {/if}

    {#if !isCreating}
      <div class="mt-5 border-t border-ink/8 pt-4">
        <Button variant="secondary" class="w-full" onclick={requestClose}>Close</Button>
      </div>
    {/if}
  </div>
</SlideOver>

<ConfirmDialog
  open={confirmingDelete}
  title="Delete this offline gift?"
  message={`Delete the ${displayed ? formatCents(displayed.amount_cents) : ""} offline gift? It comes off the total and cannot be undone.`}
  confirmLabel="Delete gift"
  tone="danger"
  busy={isDeleting}
  onConfirm={deleteGift}
  onCancel={() => (confirmingDelete = false)}
/>
