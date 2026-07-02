<script>
  // Full prospect profile: research facts, the tailored engagement-plan
  // checklist, pipeline settings, and the contact log. All saves use the
  // shared optimistic-lock pattern so concurrent edits surface a friendly
  // conflict instead of clobbering.
  import {
    CalendarClock,
    Globe,
    Send,
    Trash2,
    UserPlus,
  } from "@lucide/svelte";
  import { isSuperuser } from "../../../lib/dashboard/roles";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Field from "../ui/Field.svelte";
  import {
    INTERACTION_KINDS,
    PROSPECT_COLUMNS,
    PROSPECT_KINDS,
    PROSPECT_STAGES,
    addInteraction,
    loadInteractions,
  } from "../../../lib/dashboard/fundraising";

  export let supabase;
  export let prospect = null;
  export let teamMembers = [];
  export let currentUserRole = "member";
  export let onClose = () => {};
  export let onProspectUpdated = () => {};
  export let onProspectDeleted = () => {};
  export let onAssignTask = () => {};

  const FIT_TONES = { high: "green", medium: "amber", low: "neutral" };
  const STAGE_TONES = {
    Research: "neutral",
    Outreach: "blue",
    "In Conversation": "blue",
    Application: "amber",
    Committed: "green",
    Stewardship: "green",
    Declined: "red",
  };
  const CONFLICT_MESSAGE =
    "Someone else just updated this prospect, so their latest version has been loaded. Please re-apply your change.";

  let displayedProspect = null;
  let drawerOpen = false;
  let isSaving = false;
  let saveChain = Promise.resolve();
  let isDeleting = false;
  let confirmingDelete = false;
  let errorMessage = "";
  let successMessage = "";
  let notesDraft = "";
  let nextActionDraft = "";
  let interactions = [];
  let interactionsLoading = false;
  let newInteractionKind = "note";
  let newInteractionBody = "";
  let loggingInteraction = false;

  // Deleting is gated by app_private.is_admin() in RLS, which currently
  // resolves to superuser only; keep the button in sync so it never no-ops.
  $: canDelete = isSuperuser(currentUserRole);
  $: if (prospect?.id && prospect.id !== displayedProspect?.id) {
    openDrawer(prospect);
  } else if (!prospect && drawerOpen) {
    drawerOpen = false;
  }
  $: plan = Array.isArray(displayedProspect?.engagement_plan)
    ? displayedProspect.engagement_plan
    : [];
  $: planDoneCount = plan.filter((step) => step.done).length;

  function openDrawer(next) {
    displayedProspect = next;
    notesDraft = next.research_notes || "";
    nextActionDraft = next.next_action || "";
    errorMessage = "";
    successMessage = "";
    newInteractionBody = "";
    drawerOpen = true;
    loadLog(next.id);
  }

  function requestClose() {
    if (isSaving || isDeleting) return;
    drawerOpen = false;
  }

  function handleClose() {
    drawerOpen = false;
    displayedProspect = null;
    onClose();
  }

  async function loadLog(prospectId) {
    interactionsLoading = true;
    interactions = [];

    const { data, error } = await loadInteractions(supabase, { prospectId });

    if (!error && displayedProspect?.id === prospectId) {
      interactions = data || [];
    }
    interactionsLoading = false;
  }

  // Serialize saves so quick successive edits are applied in order.
  function saveUpdates(updates, successText) {
    if (!displayedProspect?.id) return saveChain;
    saveChain = saveChain.then(() => runSave(updates, successText));
    return saveChain;
  }

  async function runSave(updates, successText) {
    if (!displayedProspect?.id) return;

    isSaving = true;
    errorMessage = "";
    successMessage = "";

    let query = supabase
      .from("fundraising_prospects")
      .update(updates)
      .eq("id", displayedProspect.id);
    if (displayedProspect.updated_at) {
      query = query.eq("updated_at", displayedProspect.updated_at);
    }

    const { data, error } = await query.select(PROSPECT_COLUMNS).maybeSingle();

    if (error) {
      errorMessage = error.message;
    } else if (!data) {
      errorMessage = CONFLICT_MESSAGE;
      await reloadDisplayedProspect();
    } else {
      displayedProspect = data;
      onProspectUpdated(data);
      successMessage = successText;
    }

    isSaving = false;
  }

  async function reloadDisplayedProspect() {
    if (!displayedProspect?.id) return;

    const { data } = await supabase
      .from("fundraising_prospects")
      .select(PROSPECT_COLUMNS)
      .eq("id", displayedProspect.id)
      .maybeSingle();

    if (data) {
      displayedProspect = data;
      notesDraft = data.research_notes || "";
      nextActionDraft = data.next_action || "";
      onProspectUpdated(data);
    }
  }

  function togglePlanStep(index, checked) {
    const nextPlan = plan.map((step, i) =>
      i === index
        ? { ...step, done: checked, done_at: checked ? new Date().toISOString() : null }
        : step,
    );
    saveUpdates(
      { engagement_plan: nextPlan },
      checked ? "Step checked off." : "Step reopened.",
    );
  }

  function saveNotes() {
    const next = notesDraft.trim() || null;
    if ((displayedProspect?.research_notes || null) === next) return;
    saveUpdates({ research_notes: next }, "Notes saved.");
  }

  function saveNextAction() {
    const next = nextActionDraft.trim() || null;
    if ((displayedProspect?.next_action || null) === next) return;
    saveUpdates({ next_action: next }, "Next action saved.");
  }

  async function logInteraction(event) {
    event?.preventDefault();

    const body = newInteractionBody.trim();
    if (!body || loggingInteraction || !displayedProspect?.id) return;

    loggingInteraction = true;
    errorMessage = "";

    const { data, error } = await addInteraction(supabase, {
      prospectId: displayedProspect.id,
      kind: newInteractionKind,
      body,
    });

    if (error) {
      errorMessage = error.message;
    } else {
      interactions = [data, ...interactions];
      newInteractionBody = "";
      // The DB trigger rolled last_contact_at forward; reflect it locally.
      const updated = {
        ...displayedProspect,
        last_contact_at: data.occurred_at,
      };
      displayedProspect = updated;
      onProspectUpdated(updated);
    }

    loggingInteraction = false;
  }

  function requestDelete() {
    if (!displayedProspect?.id || isDeleting) return;
    confirmingDelete = true;
  }

  async function deleteProspect() {
    if (!displayedProspect?.id || isDeleting) return;

    isDeleting = true;
    errorMessage = "";

    const { data, error } = await supabase
      .from("fundraising_prospects")
      .delete()
      .eq("id", displayedProspect.id)
      .select("id");

    if (error || !data?.length) {
      errorMessage =
        error?.message ||
        "This prospect could not be deleted. It may already be gone, or you may not have permission.";
      isDeleting = false;
      confirmingDelete = false;
      return;
    }

    const deletedId = displayedProspect.id;
    isDeleting = false;
    confirmingDelete = false;
    onProspectDeleted(deletedId);
    requestClose();
  }

  function formatDate(value) {
    if (!value) return "None set";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function formatDateTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function factRows(item) {
    if (!item) return [];
    return [
      { label: "Geography", value: item.geography },
      { label: "Typical grant range", value: item.typical_grant_range },
      { label: "Annual giving", value: item.annual_giving },
      { label: "Suggested ask", value: item.suggested_ask },
      { label: "Deadlines", value: item.deadlines },
      { label: "Key people", value: item.key_people },
      { label: "Contact", value: item.contact_info },
    ].filter((row) => Boolean(row.value));
  }
</script>

<SlideOver
  open={drawerOpen}
  title={displayedProspect?.name || ""}
  eyebrow="Fundraising prospect"
  closeLabel="Close prospect details"
  closeDisabled={isSaving || isDeleting}
  onClose={requestClose}
  onClosed={handleClose}
>
  {#if displayedProspect}
    <div class="px-5 py-5">
      <div class="flex flex-wrap gap-2">
        <Badge tone={STAGE_TONES[displayedProspect.stage] || "neutral"}>
          {displayedProspect.stage}
        </Badge>
        {#if displayedProspect.fit_score}
          <Badge tone={FIT_TONES[displayedProspect.fit_score] || "neutral"}>
            Fit: {displayedProspect.fit_score}
          </Badge>
        {/if}
        <Badge tone="neutral">
          <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
          Next: {formatDate(displayedProspect.next_action_date)}
        </Badge>
        {#if displayedProspect.last_contact_at}
          <Badge tone="neutral">Last contact {formatDateTime(displayedProspect.last_contact_at)}</Badge>
        {/if}
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        {#if displayedProspect.website}
          <Button
            size="sm"
            icon={Globe}
            href={displayedProspect.website}
            target="_blank"
            rel="noreferrer"
          >
            Website
          </Button>
        {/if}
        <Button
          size="sm"
          icon={UserPlus}
          onclick={() =>
            onAssignTask({
              sourceModule: "fundraising",
              sourceLabel: `Prospect: ${displayedProspect.name}`,
              sourceLink: "#fundraising",
              title: `Follow up: ${displayedProspect.name}`,
            })}
        >
          Assign a task about this
        </Button>
      </div>

      {#if errorMessage}
        <Banner tone="error" message={errorMessage} class="mt-4" />
      {/if}
      {#if successMessage}
        <Banner tone="success" message={successMessage} class="mt-4" />
      {/if}

      {#if displayedProspect.fit_rationale}
        <section class="mt-5 rounded-control border border-ink/8 bg-canvas/60 p-4">
          <h4 class="font-bold text-ink">Why {displayedProspect.fit_score || "this"} fit</h4>
          <p class="mt-2 text-sm leading-6 text-ink/75">{displayedProspect.fit_rationale}</p>
        </section>
      {/if}

      {#if plan.length}
        <section class="mt-5 rounded-control border border-ink/8 bg-white p-4" aria-labelledby="engagement-plan-title">
          <div class="flex items-center justify-between gap-3">
            <h4 id="engagement-plan-title" class="font-bold text-ink">Engagement plan</h4>
            <Badge tone={planDoneCount === plan.length ? "green" : "neutral"} size="xs">
              {planDoneCount}/{plan.length} done
            </Badge>
          </div>
          <ol class="mt-3 space-y-3">
            {#each plan as step, index (index)}
              <li class="flex items-start gap-3">
                <input
                  type="checkbox"
                  class="mt-1 h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent"
                  checked={Boolean(step.done)}
                  aria-label={`Mark step "${step.step}" ${step.done ? "not done" : "done"}`}
                  disabled={isSaving}
                  onchange={(event) => togglePlanStep(index, event.currentTarget.checked)}
                />
                <div class="min-w-0">
                  <p class="text-sm font-bold leading-snug {step.done ? 'text-ink/45 line-through' : 'text-ink'}">
                    {step.step}
                  </p>
                  {#if step.detail}
                    <p class="mt-1 text-sm leading-6 {step.done ? 'text-ink/40' : 'text-ink/70'}">
                      {step.detail}
                    </p>
                  {/if}
                </div>
              </li>
            {/each}
          </ol>
        </section>
      {/if}

      {#if factRows(displayedProspect).length}
        <section class="mt-5 rounded-control border border-ink/8 bg-white p-4">
          <h4 class="font-bold text-ink">Fast facts</h4>
          <dl class="mt-3 space-y-3">
            {#each factRows(displayedProspect) as row (row.label)}
              <div>
                <dt class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">{row.label}</dt>
                <dd class="mt-1 text-sm leading-6 text-ink/80">{row.value}</dd>
              </div>
            {/each}
          </dl>
        </section>
      {/if}

      {#if displayedProspect.application_process || displayedProspect.recent_relevant_giving || displayedProspect.focus_areas?.length}
        <section class="mt-5 rounded-control border border-ink/8 bg-white p-4">
          <h4 class="font-bold text-ink">Research</h4>
          {#if displayedProspect.focus_areas?.length}
            <div class="mt-3 flex flex-wrap gap-1.5">
              {#each displayedProspect.focus_areas as area (area)}
                <Badge tone="neutral" size="xs">{area}</Badge>
              {/each}
            </div>
          {/if}
          {#if displayedProspect.application_process}
            <p class="mt-3 text-sm leading-6 text-ink/75">
              <span class="font-bold text-ink">How to apply:</span>
              {displayedProspect.application_process}
            </p>
          {/if}
          {#if displayedProspect.recent_relevant_giving}
            <p class="mt-3 text-sm leading-6 text-ink/75">
              <span class="font-bold text-ink">Relevant giving:</span>
              {displayedProspect.recent_relevant_giving}
            </p>
          {/if}
        </section>
      {/if}

      <section class="mt-5 rounded-control border border-ink/8 bg-white p-4" aria-labelledby="prospect-settings-title">
        <div class="flex items-start justify-between gap-3">
          <h4 id="prospect-settings-title" class="font-bold text-ink">Pipeline settings</h4>
          {#if isSaving}
            <Badge tone="neutral" size="xs" class="shrink-0">Saving</Badge>
          {/if}
        </div>

        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Stage" id={`prospect-stage-${displayedProspect.id}`}>
            <select
              id={`prospect-stage-${displayedProspect.id}`}
              class="select"
              value={displayedProspect.stage}
              disabled={isSaving}
              onchange={(event) =>
                saveUpdates({ stage: event.currentTarget.value }, `Moved to ${event.currentTarget.value}.`)}
            >
              {#each PROSPECT_STAGES as stage}
                <option value={stage}>{stage}</option>
              {/each}
            </select>
          </Field>

          <Field label="Owner" id={`prospect-owner-${displayedProspect.id}`}>
            <select
              id={`prospect-owner-${displayedProspect.id}`}
              class="select"
              value={displayedProspect.owner_id || ""}
              disabled={isSaving}
              onchange={(event) =>
                saveUpdates(
                  { owner_id: event.currentTarget.value || null },
                  "Owner updated: it now shows in their Workspace.",
                )}
            >
              <option value="">Unowned</option>
              {#each teamMembers as member}
                <option value={member.id}>{member.full_name || member.email}</option>
              {/each}
            </select>
          </Field>

          <Field label="Priority" id={`prospect-priority-${displayedProspect.id}`}>
            <select
              id={`prospect-priority-${displayedProspect.id}`}
              class="select"
              value={displayedProspect.priority || "P2"}
              disabled={isSaving}
              onchange={(event) =>
                saveUpdates({ priority: event.currentTarget.value }, "Priority updated.")}
            >
              <option value="P0">Urgent (P0)</option>
              <option value="P1">High (P1)</option>
              <option value="P2">Normal (P2)</option>
            </select>
          </Field>

          <Field label="Type" id={`prospect-kind-${displayedProspect.id}`}>
            <select
              id={`prospect-kind-${displayedProspect.id}`}
              class="select"
              value={displayedProspect.kind}
              disabled={isSaving}
              onchange={(event) =>
                saveUpdates({ kind: event.currentTarget.value }, "Type updated.")}
            >
              {#each PROSPECT_KINDS as kind}
                <option value={kind.value}>{kind.label}</option>
              {/each}
            </select>
          </Field>

          <Field label="Next action" id={`prospect-next-${displayedProspect.id}`} class="sm:col-span-2">
            <input
              id={`prospect-next-${displayedProspect.id}`}
              type="text"
              class="input"
              placeholder="e.g. Email program officer with one-pager"
              bind:value={nextActionDraft}
              disabled={isSaving}
              onblur={saveNextAction}
            />
          </Field>

          <Field label="Next action date" id={`prospect-next-date-${displayedProspect.id}`}>
            <input
              id={`prospect-next-date-${displayedProspect.id}`}
              type="date"
              class="input"
              value={displayedProspect.next_action_date || ""}
              disabled={isSaving}
              onchange={(event) =>
                saveUpdates(
                  { next_action_date: event.currentTarget.value || null },
                  "Next action date updated.",
                )}
            />
          </Field>
        </div>

        <Field label="Team notes" id={`prospect-notes-${displayedProspect.id}`} class="mt-4">
          <textarea
            id={`prospect-notes-${displayedProspect.id}`}
            class="textarea"
            rows="3"
            placeholder="Anything the team should know: relationships, history, warm intros"
            bind:value={notesDraft}
            disabled={isSaving}
            onblur={saveNotes}
          ></textarea>
        </Field>
      </section>

      <section class="mt-5 rounded-control border border-ink/8 bg-white p-4" aria-labelledby="prospect-log-title">
        <h4 id="prospect-log-title" class="font-bold text-ink">Contact log</h4>

        <form class="mt-3 space-y-2" onsubmit={logInteraction}>
          <div class="grid grid-cols-[auto_1fr] gap-2">
            <select class="select" aria-label="Interaction type" bind:value={newInteractionKind} disabled={loggingInteraction}>
              {#each INTERACTION_KINDS as kind}
                <option value={kind.value}>{kind.label}</option>
              {/each}
            </select>
            <Button
              variant="primary"
              type="submit"
              icon={Send}
              class="justify-self-end"
              loading={loggingInteraction}
              disabled={!newInteractionBody.trim()}
            >
              Log it
            </Button>
          </div>
          <textarea
            class="textarea"
            rows="2"
            placeholder="What happened? e.g. Left voicemail for grants manager; sending one-pager Friday."
            aria-label="Interaction details"
            bind:value={newInteractionBody}
            disabled={loggingInteraction}
          ></textarea>
        </form>

        <div class="mt-4 space-y-3">
          {#if interactionsLoading}
            <p class="text-sm text-ink/55">Loading contact history…</p>
          {:else if interactions.length}
            {#each interactions as entry (entry.id)}
              <article class="rounded-control border border-ink/8 bg-canvas/50 px-3 py-2.5">
                <div class="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink/55">
                  <Badge tone="neutral" size="xs">{entry.kind}</Badge>
                  <span>{entry.author_name || "Team member"}</span>
                  <span>·</span>
                  <span>{formatDateTime(entry.occurred_at)}</span>
                </div>
                <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/80">{entry.body}</p>
              </article>
            {/each}
          {:else}
            <p class="rounded-control border border-dashed border-ink/15 bg-white px-3 py-4 text-center text-sm text-ink/55">
              No contact logged yet. Every call, email, and meeting you log here
              keeps the whole team's context in one place.
            </p>
          {/if}
        </div>
      </section>

      {#if canDelete}
        <section class="mt-5 rounded-control border border-red-200 bg-red-50/50 p-4">
          <h4 class="font-bold text-red-800">Danger zone</h4>
          <Button variant="danger" icon={Trash2} class="mt-3" loading={isDeleting} onclick={requestDelete}>
            Delete prospect
          </Button>
        </section>
      {/if}

      <div class="mt-5 border-t border-ink/8 pt-4">
        <Button variant="secondary" class="w-full" onclick={requestClose}>Close</Button>
      </div>
    </div>
  {/if}
</SlideOver>

<ConfirmDialog
  open={confirmingDelete}
  title="Delete this prospect?"
  message={`Delete "${displayedProspect?.name}" including its research, engagement plan, and contact log? This cannot be undone.`}
  confirmLabel="Delete prospect"
  tone="danger"
  busy={isDeleting}
  onConfirm={deleteProspect}
  onCancel={() => (confirmingDelete = false)}
/>
