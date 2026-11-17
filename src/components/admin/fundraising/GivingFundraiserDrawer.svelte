<script>
  // One Giving Tuesday fundraiser: status (approve, hide, back to pending),
  // board details, notes and their Zeffy page link. Also the add-by-hand form
  // for instructors who do not use the public sign-up. Every save carries the
  // shared optimistic lock (.eq("updated_at", loaded.updated_at)).
  import { Check, Copy, EyeOff, ExternalLink, RotateCcw, Save, UserPlus } from "@lucide/svelte";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import Field from "../ui/Field.svelte";
  import {
    COHORTS,
    FUNDRAISER_COLUMNS,
    ZEFFY_FUNDRAISER_HELPER_URL,
    cohortLabel,
    formatCents,
    formatChicagoDateTimeLabel,
    nextFreeSlug,
    normalizeZeffyUrl,
    oneLine,
    validateFundraiserInput,
  } from "../../../lib/dashboard/givingAdmin";

  export let supabase;
  export let profile = null;
  export let campaign;
  export let fundraiser = null;
  export let totals = null;
  export let createRequest = 0;
  export let onSaved = async () => {};
  export let onClose = () => {};

  const STATUS_TONES = { pending: "amber", approved: "green", hidden: "neutral" };
  const STATUS_LABELS = { pending: "Pending", approved: "Approved", hidden: "Hidden" };
  const CONFLICT_MESSAGE =
    "Someone else just updated this fundraiser, so their latest version has been loaded. Please re-apply your change.";

  let displayed = null;
  let drawerOpen = false;
  let isCreating = false;
  let lastCreateRequest = createRequest;
  let isSaving = false;
  let errorMessage = "";
  let successMessage = "";
  let copied = "";
  let copiedTimer;

  // Edit drafts
  let draftDisplayName = "";
  let draftWhy = "";
  let draftShowOnBoard = true;
  let draftCohort = "instructor";
  let draftNotes = "";
  let draftZeffyUrl = "";

  // Create drafts
  let newFirst = "";
  let newLast = "";
  let newEmail = "";
  let newPhone = "";
  let newConsent = false;
  let newApprove = true;

  $: if (fundraiser?.id && fundraiser.id !== displayed?.id) {
    openFor(fundraiser);
  } else if (fundraiser?.id && displayed?.id === fundraiser.id && fundraiser.updated_at > displayed.updated_at && !isSaving) {
    // The parent reloaded a newer copy (for example after a quick approve).
    displayed = fundraiser;
    seedDrafts(fundraiser);
  }
  $: if (createRequest !== lastCreateRequest) {
    lastCreateRequest = createRequest;
    openForCreate();
  }
  $: whyLength = oneLine(draftWhy).length;
  $: isDirty = Boolean(displayed) && !isCreating &&
    (oneLine(draftDisplayName) !== (displayed.display_name || "") ||
      (oneLine(draftWhy) || null) !== (displayed.why || null) ||
      draftShowOnBoard !== Boolean(displayed.show_on_board) ||
      draftCohort !== displayed.cohort ||
      (draftNotes.trim() || null) !== (displayed.notes || null) ||
      (draftZeffyUrl.trim() || null) !== (displayed.zeffy_url || null));
  $: notEligibleCents =
    Number(totals?.self_gift_cents || 0) + Number(totals?.flagged_cents || 0) + Number(totals?.late_cents || 0);

  function seedDrafts(row) {
    draftDisplayName = row.display_name || "";
    draftWhy = row.why || "";
    draftShowOnBoard = Boolean(row.show_on_board);
    draftCohort = row.cohort || "instructor";
    draftNotes = row.notes || "";
    draftZeffyUrl = row.zeffy_url || "";
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
    newFirst = "";
    newLast = "";
    newEmail = "";
    newPhone = "";
    newConsent = false;
    newApprove = true;
    draftWhy = "";
    draftShowOnBoard = true;
    draftCohort = "instructor";
    draftNotes = "";
    draftZeffyUrl = "";
    drawerOpen = true;
  }

  function requestClose() {
    if (isSaving) return;
    drawerOpen = false;
  }

  function handleClosed() {
    drawerOpen = false;
    displayed = null;
    isCreating = false;
    onClose();
  }

  async function copyText(text, which) {
    try {
      await navigator.clipboard.writeText(text);
      copied = which;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = ""), 1800);
    } catch {
      /* clipboard blocked: the text is on screen to copy by hand */
    }
  }

  async function runUpdate(updates, successText) {
    if (!displayed?.id || isSaving) return;
    isSaving = true;
    errorMessage = "";
    successMessage = "";

    const { data, error } = await supabase
      .from("giving_fundraisers")
      .update(updates)
      .eq("id", displayed.id)
      .eq("updated_at", displayed.updated_at)
      .select(FUNDRAISER_COLUMNS)
      .maybeSingle();

    if (error) {
      errorMessage = error.code === "23505"
        ? "Another fundraiser already uses that Zeffy page."
        : error.message;
    } else if (!data) {
      errorMessage = CONFLICT_MESSAGE;
      const { data: fresh } = await supabase
        .from("giving_fundraisers")
        .select(FUNDRAISER_COLUMNS)
        .eq("id", displayed.id)
        .maybeSingle();
      if (fresh) {
        displayed = fresh;
        seedDrafts(fresh);
      }
    } else {
      displayed = data;
      seedDrafts(data);
      successMessage = successText;
    }
    isSaving = false;
    await onSaved(displayed);
  }

  function setStatus(status) {
    if (status === "approved") {
      runUpdate(
        { status, approved_at: new Date().toISOString(), approved_by: profile?.id || null },
        "Approved. Create their Zeffy page next, then paste the link below.",
      );
    } else if (status === "hidden") {
      runUpdate({ status }, "Hidden. They are off the public board and out of the drawing.");
    } else {
      runUpdate({ status: "pending", approved_at: null, approved_by: null }, "Moved back to pending.");
    }
  }

  function saveEdits(event) {
    event?.preventDefault();
    if (!displayed) return;
    errorMessage = "";
    const name = oneLine(draftDisplayName);
    if (!name || name.length > 121) {
      errorMessage = "The display name is required (121 characters at most).";
      return;
    }
    const why = oneLine(draftWhy);
    if (why.length > 160) {
      errorMessage = "The why line is 160 characters at most.";
      return;
    }
    const zeffy = normalizeZeffyUrl(draftZeffyUrl);
    if (!zeffy.ok) {
      errorMessage = `Zeffy page: ${zeffy.message}`;
      return;
    }
    const updates = {
      display_name: name,
      why: why || null,
      show_on_board: draftShowOnBoard,
      cohort: draftCohort,
      notes: draftNotes.trim() || null,
      zeffy_url: zeffy.value,
    };
    // A new page link means the stored Zeffy page id may be stale; the next
    // sync re-matches it from the link.
    if ((zeffy.value || null) !== (displayed.zeffy_url || null)) updates.zeffy_campaign_id = null;
    runUpdate(updates, "Saved.");
  }

  async function createFundraiser(event) {
    event?.preventDefault();
    if (isSaving || !campaign) return;
    errorMessage = "";

    const checked = validateFundraiserInput({
      firstName: newFirst,
      lastName: newLast,
      email: newEmail,
      phone: newPhone,
      cohort: draftCohort,
      why: draftWhy,
    });
    if (!checked.ok) {
      errorMessage = checked.message;
      return;
    }
    if (!newConsent) {
      errorMessage = "Confirm they agreed to a public fundraising page.";
      return;
    }
    const zeffy = normalizeZeffyUrl(draftZeffyUrl);
    if (!zeffy.ok) {
      errorMessage = `Zeffy page: ${zeffy.message}`;
      return;
    }

    isSaving = true;
    const v = checked.value;
    let created = null;

    // Slugs are taken fresh each attempt; the unique index catches a race and
    // the second attempt picks the next free number.
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      const { data: existing, error: slugError } = await supabase
        .from("giving_fundraisers")
        .select("slug,email")
        .eq("campaign_slug", campaign.slug)
        .limit(2000);
      if (slugError) {
        errorMessage = slugError.message;
        break;
      }
      if ((existing || []).some((row) => String(row.email).toLowerCase() === v.email)) {
        errorMessage = "Someone with that email is already on the roster.";
        break;
      }
      const slug = nextFreeSlug(v.baseSlug, (existing || []).map((row) => row.slug));
      const { data: avatar } = await supabase
        .from("giving_avatar_slugs")
        .select("slug")
        .eq("slug", slug)
        .maybeSingle();

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("giving_fundraisers")
        .insert({
          campaign_slug: campaign.slug,
          slug,
          first_name: v.firstName,
          last_name: v.lastName,
          display_name: `${v.firstName} ${v.lastName}`,
          email: v.email,
          phone: v.phone || null,
          cohort: v.cohort,
          why: v.why || null,
          avatar_slug: avatar?.slug || null,
          show_on_board: draftShowOnBoard,
          consent_page: true,
          status: newApprove ? "approved" : "pending",
          goal_cents: campaign.threshold_cents,
          zeffy_url: zeffy.value,
          approved_at: newApprove ? now : null,
          approved_by: newApprove ? profile?.id || null : null,
          notes: draftNotes.trim() || null,
        })
        .select(FUNDRAISER_COLUMNS)
        .maybeSingle();

      if (!error) {
        created = data;
      } else if (error.code === "23505" && /email/i.test(error.message)) {
        errorMessage = "Someone with that email is already on the roster.";
        break;
      } else if (error.code !== "23505") {
        errorMessage = error.message;
        break;
      }
    }

    isSaving = false;
    if (created) {
      await onSaved(created);
      openFor(created);
      successMessage = `Added ${created.display_name}.`;
    } else if (!errorMessage) {
      errorMessage = "Could not find a free page name. Try again.";
    }
  }
</script>

<SlideOver
  open={drawerOpen}
  title={isCreating ? "Add a fundraiser" : displayed?.display_name || ""}
  eyebrow="Giving Tuesday fundraiser"
  closeLabel="Close fundraiser"
  closeDisabled={isSaving}
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

    {#if isCreating}
      <p class="text-sm leading-6 text-ink/65">
        For instructors who do not use the public form. The same checks apply, and the page name is made the same way.
      </p>
      <form class="mt-4 space-y-4" onsubmit={createFundraiser}>
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label="First name" id="gf-new-first" required>
            <input id="gf-new-first" class="input" maxlength="60" bind:value={newFirst} disabled={isSaving} />
          </Field>
          <Field label="Last name" id="gf-new-last" required>
            <input id="gf-new-last" class="input" maxlength="60" bind:value={newLast} disabled={isSaving} />
          </Field>
          <Field label="Email" id="gf-new-email" required>
            <input id="gf-new-email" type="email" class="input" maxlength="200" bind:value={newEmail} disabled={isSaving} />
          </Field>
          <Field label="Phone" id="gf-new-phone">
            <input id="gf-new-phone" type="tel" class="input" maxlength="30" bind:value={newPhone} disabled={isSaving} />
          </Field>
          <Field label="Cohort" id="gf-new-cohort">
            <select id="gf-new-cohort" class="select" bind:value={draftCohort} disabled={isSaving}>
              {#each COHORTS as cohort (cohort.value)}
                <option value={cohort.value}>{cohort.label}</option>
              {/each}
            </select>
          </Field>
        </div>
        <Field label="Why they are raising money" id="gf-new-why" hint={`${whyLength} of 160 characters`}>
          <textarea id="gf-new-why" class="textarea" rows="2" maxlength="200" bind:value={draftWhy} disabled={isSaving}></textarea>
        </Field>
        <Field label="Zeffy page" id="gf-new-zeffy" hint="Optional. Paste it now or after you create their page.">
          <input id="gf-new-zeffy" type="url" class="input" placeholder="https://www.zeffy.com/..." bind:value={draftZeffyUrl} disabled={isSaving} />
        </Field>
        <Field label="Notes" id="gf-new-notes">
          <textarea id="gf-new-notes" class="textarea" rows="2" bind:value={draftNotes} disabled={isSaving}></textarea>
        </Field>
        <div class="space-y-3">
          <label class="flex items-start gap-3 text-sm">
            <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent" bind:checked={newConsent} disabled={isSaving} />
            <span class="font-semibold text-ink">They agreed to a public fundraising page</span>
          </label>
          <label class="flex items-start gap-3 text-sm">
            <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent" bind:checked={draftShowOnBoard} disabled={isSaving} />
            <span class="font-semibold text-ink">Show them on the public board</span>
          </label>
          <label class="flex items-start gap-3 text-sm">
            <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent" bind:checked={newApprove} disabled={isSaving} />
            <span class="font-semibold text-ink">Approve now</span>
          </label>
        </div>
        <div class="flex justify-end gap-2 border-t border-ink/8 pt-4">
          <Button variant="ghost" disabled={isSaving} onclick={requestClose}>Cancel</Button>
          <Button variant="primary" type="submit" icon={UserPlus} loading={isSaving}>Add fundraiser</Button>
        </div>
      </form>
    {:else if displayed}
      <div class="flex flex-wrap gap-2">
        <Badge tone={STATUS_TONES[displayed.status] || "neutral"}>{STATUS_LABELS[displayed.status] || displayed.status}</Badge>
        <Badge tone="neutral">{cohortLabel(displayed.cohort)}</Badge>
        {#if totals?.reached}
          <Badge tone="gold">Reached {formatCents(totals.threshold_cents)}</Badge>
        {/if}
        {#if !displayed.consent_page}
          <Badge tone="amber">No page consent on file</Badge>
        {/if}
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        {#if displayed.status !== "approved"}
          <Button size="sm" variant="primary" icon={Check} loading={isSaving} onclick={() => setStatus("approved")}>Approve</Button>
        {/if}
        {#if displayed.status !== "hidden"}
          <Button size="sm" icon={EyeOff} disabled={isSaving} onclick={() => setStatus("hidden")}>Hide</Button>
        {/if}
        {#if displayed.status !== "pending"}
          <Button size="sm" icon={RotateCcw} disabled={isSaving} onclick={() => setStatus("pending")}>Back to pending</Button>
        {/if}
      </div>

      <section class="mt-5 rounded-control border border-ink/8 bg-white p-4">
        <h4 class="font-bold text-ink">Contact</h4>
        <dl class="mt-3 space-y-3">
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Email</dt>
            <dd class="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/80">
              <span class="break-all">{displayed.email}</span>
              <Button size="sm" variant="ghost" icon={copied === "email" ? Check : Copy} onclick={() => copyText(displayed.email, "email")}>
                {copied === "email" ? "Copied" : "Copy"}
              </Button>
            </dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Phone</dt>
            <dd class="mt-1 text-sm text-ink/80">{displayed.phone || "Not given"}</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Signed up</dt>
            <dd class="mt-1 text-sm text-ink/80">
              {formatChicagoDateTimeLabel(displayed.created_at)}
              {#if displayed.approved_at}· approved {formatChicagoDateTimeLabel(displayed.approved_at)}{/if}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Page name · photo</dt>
            <dd class="mt-1 text-sm text-ink/80">{displayed.slug} · {displayed.avatar_slug ? "Photo on file" : "Initials, no photo on file"}</dd>
          </div>
        </dl>
      </section>

      <section class="mt-5 rounded-control border border-ink/8 bg-white p-4">
        <h4 class="font-bold text-ink">Raised</h4>
        <dl class="mt-3 grid grid-cols-2 gap-3">
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Raised</dt>
            <dd class="mt-1 text-sm font-bold text-ink">{formatCents(totals?.raised_cents || 0)} · {totals?.gift_count || 0} gifts</dd>
          </div>
          <div>
            <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Eligible</dt>
            <dd class="mt-1 text-sm font-bold text-ink">{formatCents(totals?.eligible_cents || 0)}</dd>
          </div>
        </dl>
        {#if notEligibleCents > 0}
          <p class="mt-3 text-xs leading-5 text-ink/60">
            Not eligible:
            {#if totals.self_gift_cents}{formatCents(totals.self_gift_cents)} their own gifts. {/if}
            {#if totals.flagged_cents}{formatCents(totals.flagged_cents)} taken out by staff. {/if}
            {#if totals.late_cents}{formatCents(totals.late_cents)} after the campaign ended.{/if}
          </p>
        {/if}
      </section>

      <form class="mt-5 space-y-4 rounded-control border border-ink/8 bg-white p-4" onsubmit={saveEdits}>
        <div class="flex items-start justify-between gap-3">
          <h4 class="font-bold text-ink">Board and Zeffy page</h4>
          {#if isSaving}
            <Badge tone="neutral" size="xs" class="shrink-0">Saving</Badge>
          {/if}
        </div>

        <Field label="Zeffy page" id="gf-zeffy">
          <input id="gf-zeffy" type="url" class="input" placeholder="https://www.zeffy.com/..." bind:value={draftZeffyUrl} disabled={isSaving} />
        </Field>
        <div class="flex flex-wrap gap-2">
          {#if displayed.zeffy_url}
            <Button size="sm" variant="ghost" icon={copied === "zeffy" ? Check : Copy} onclick={() => copyText(displayed.zeffy_url, "zeffy")}>
              {copied === "zeffy" ? "Copied" : "Copy Zeffy link"}
            </Button>
          {/if}
          {#if displayed.status === "approved"}
            <a
              class="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-control border border-ink/14 bg-white px-3 text-sm font-semibold text-ink shadow-card transition-colors hover:border-ink/30 hover:bg-ink/[0.03]"
              href={ZEFFY_FUNDRAISER_HELPER_URL}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink class="h-4 w-4 shrink-0" aria-hidden="true" />
              Create Zeffy page
            </a>
          {/if}
        </div>
        {#if displayed.status === "approved"}
          <p class="text-xs leading-5 text-ink/55">
            In Zeffy's dialog enter target 150, {displayed.first_name}, {displayed.last_name} and {displayed.email}, then paste their page link above.
          </p>
        {/if}

        <Field label="Display name" id="gf-name">
          <input id="gf-name" class="input" maxlength="121" bind:value={draftDisplayName} disabled={isSaving} />
        </Field>
        <Field label="Why they are raising money" id="gf-why" hint={`${whyLength} of 160 characters`} error={whyLength > 160 ? "160 characters at most" : ""}>
          <textarea id="gf-why" class="textarea" rows="2" maxlength="200" bind:value={draftWhy} disabled={isSaving}></textarea>
        </Field>
        <Field label="Cohort" id="gf-cohort">
          <select id="gf-cohort" class="select" bind:value={draftCohort} disabled={isSaving}>
            {#each COHORTS as cohort (cohort.value)}
              <option value={cohort.value}>{cohort.label}</option>
            {/each}
          </select>
        </Field>
        <label class="flex items-start gap-3 text-sm">
          <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent" bind:checked={draftShowOnBoard} disabled={isSaving} />
          <span>
            <span class="block font-semibold text-ink">Show on the public board</span>
            <span class="block text-xs text-ink/55">Only once they are approved and the board is open.</span>
          </span>
        </label>
        <Field label="Notes" id="gf-notes" hint="Staff only.">
          <textarea id="gf-notes" class="textarea" rows="3" bind:value={draftNotes} disabled={isSaving}></textarea>
        </Field>
        <div class="flex justify-end">
          <Button variant="primary" type="submit" icon={Save} loading={isSaving} disabled={!isDirty}>Save changes</Button>
        </div>
      </form>

      <div class="mt-5 border-t border-ink/8 pt-4">
        <Button variant="secondary" class="w-full" onclick={requestClose}>Close</Button>
      </div>
    {/if}
  </div>
</SlideOver>
