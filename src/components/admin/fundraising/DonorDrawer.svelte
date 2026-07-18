<script>
  // One donor's full picture: lifetime giving, gift history, the team's
  // contact log, and now the relationship layer — who owns this donor, the
  // outreach CRM fields, and template-powered sends. The summary row stays
  // read-only (it's aggregated from Zeffy imports); everything editable lives
  // on fundraising_donor_profiles keyed by email.
  import { CalendarClock, HandCoins, Mail, Phone, Send, UserPlus } from "@lucide/svelte";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import Field from "../ui/Field.svelte";
  import TemplateMergePanel from "./TemplateMergePanel.svelte";
  import {
    INTERACTION_KINDS,
    addInteraction,
    formatMoney,
    loadDonationsForEmail,
    loadInteractions,
  } from "../../../lib/dashboard/fundraising";
  import {
    CAPACITY_ESTIMATES,
    CONTACT_METHODS,
    DONOR_TASK_PRESETS,
    loadDonorProfile,
    normalizeDonorEmail,
    upsertDonorProfile,
  } from "../../../lib/dashboard/fundraisingCrm";

  export let supabase;
  export let donor = null;
  export let teamMembers = [];
  export let templates = [];
  export let currentUserId = "";
  export let currentUserName = "";
  export let onClose = () => {};
  export let onAssignTask = () => {};
  export let onProfileSaved = () => {};
  export let onWorkspaceChanged = () => {};

  const PROFILE_CONFLICT_MESSAGE =
    "Someone else just updated this donor's relationship info, so their version has been loaded. Please re-apply your change.";

  let displayedDonor = null;
  let drawerOpen = false;
  let gifts = [];
  let giftsLoading = false;
  let interactions = [];
  let interactionsLoading = false;
  let errorMessage = "";
  let newInteractionKind = "note";
  let newInteractionBody = "";
  let loggingInteraction = false;
  let loggingTemplateSend = false;

  // Relationship profile state. Drafts are separate top-level variables so
  // Svelte legacy mode tracks every read directly in the template.
  let donorProfile = null;
  let profileLoading = false;
  let profileSaving = false;
  let draftOwnerId = "";
  let draftNextAction = "";
  let draftNextActionDate = "";
  let draftPreferredMethod = "";
  let draftCapacity = "";
  let draftAreas = "";
  let draftWarmIntro = "";
  let draftBoardConnection = "";

  $: if (donor?.email && donor.email !== displayedDonor?.email) {
    openDrawer(donor);
  } else if (!donor && drawerOpen) {
    drawerOpen = false;
  }
  $: donorTitle =
    displayedDonor?.donor_name || displayedDonor?.company_name || displayedDonor?.email || "";
  $: lastContact = interactions[0] || null;
  $: ownerMember = teamMembers.find((member) => member.id === donorProfile?.owner_id) || null;
  $: profileDirty =
    draftOwnerId !== (donorProfile?.owner_id || "") ||
    draftNextAction !== (donorProfile?.next_action || "") ||
    draftNextActionDate !== (donorProfile?.next_action_date || "") ||
    draftPreferredMethod !== (donorProfile?.preferred_contact_method || "") ||
    draftCapacity !== (donorProfile?.capacity_estimate || "") ||
    draftAreas !== (donorProfile?.areas_of_interest || "") ||
    draftWarmIntro !== (donorProfile?.warm_intro_source || "") ||
    draftBoardConnection !== (donorProfile?.board_connection || "");

  function openDrawer(nextDonor) {
    displayedDonor = nextDonor;
    errorMessage = "";
    newInteractionBody = "";
    drawerOpen = true;
    loadHistory(nextDonor.email);
    loadProfile(nextDonor.email);
  }

  // requestClose starts the slide-out; handleClose runs after the animation
  // so the drawer content doesn't vanish mid-slide.
  function requestClose() {
    if (profileSaving) return;
    drawerOpen = false;
  }

  function handleClose() {
    drawerOpen = false;
    displayedDonor = null;
    donorProfile = null;
    seedProfileDrafts(null);
    onClose();
  }

  function seedProfileDrafts(profile) {
    draftOwnerId = profile?.owner_id || "";
    draftNextAction = profile?.next_action || "";
    draftNextActionDate = profile?.next_action_date || "";
    draftPreferredMethod = profile?.preferred_contact_method || "";
    draftCapacity = profile?.capacity_estimate || "";
    draftAreas = profile?.areas_of_interest || "";
    draftWarmIntro = profile?.warm_intro_source || "";
    draftBoardConnection = profile?.board_connection || "";
  }

  async function loadProfile(email) {
    profileLoading = true;
    donorProfile = null;
    seedProfileDrafts(null);

    const { data, error } = await loadDonorProfile(supabase, email);

    if (displayedDonor?.email !== email) return;

    if (error) {
      errorMessage = errorMessage || error.message;
    } else {
      donorProfile = data;
      seedProfileDrafts(data);
    }
    profileLoading = false;
  }

  async function loadHistory(email) {
    giftsLoading = true;
    interactionsLoading = true;
    gifts = [];
    interactions = [];

    const [giftsResult, logResult] = await Promise.all([
      loadDonationsForEmail(supabase, email),
      loadInteractions(supabase, { donorEmail: email }),
    ]);

    if (displayedDonor?.email !== email) return;

    if (giftsResult.error) {
      errorMessage = giftsResult.error.message;
    } else {
      gifts = giftsResult.data || [];
    }
    if (logResult.error) {
      errorMessage = errorMessage || logResult.error.message;
    } else {
      interactions = logResult.data || [];
    }

    giftsLoading = false;
    interactionsLoading = false;
  }

  async function saveProfile(event) {
    event?.preventDefault();
    if (profileSaving || !displayedDonor?.email) return;

    profileSaving = true;
    errorMessage = "";

    const { data, error } = await upsertDonorProfile(supabase, {
      email: displayedDonor.email,
      displayName: donorTitle,
      expectedUpdatedAt: donorProfile?.updated_at || null,
      ownerId: draftOwnerId || null,
      nextAction: draftNextAction,
      nextActionDate: draftNextActionDate || null,
      preferredContactMethod: draftPreferredMethod || null,
      capacityEstimate: draftCapacity || null,
      areasOfInterest: draftAreas,
      warmIntroSource: draftWarmIntro,
      boardConnection: draftBoardConnection,
    });

    profileSaving = false;

    if (error) {
      // A concurrent first save can beat our insert; retry as an update.
      if (!donorProfile && error.code === "23505") {
        await loadProfile(displayedDonor.email);
        errorMessage = PROFILE_CONFLICT_MESSAGE;
        return;
      }
      errorMessage = error.message;
      return;
    }

    if (!data) {
      errorMessage = PROFILE_CONFLICT_MESSAGE;
      await loadProfile(displayedDonor.email);
      return;
    }

    donorProfile = data;
    seedProfileDrafts(data);
    onProfileSaved(data);
    onWorkspaceChanged();
  }

  async function logInteraction(event) {
    event?.preventDefault();

    const body = newInteractionBody.trim();
    if (!body || loggingInteraction || !displayedDonor?.email) return;

    loggingInteraction = true;
    errorMessage = "";

    const { data, error } = await addInteraction(supabase, {
      donorEmail: displayedDonor.email,
      kind: newInteractionKind,
      body,
    });

    if (error) {
      errorMessage = error.message;
    } else {
      interactions = [data, ...interactions];
      newInteractionBody = "";
    }

    loggingInteraction = false;
  }

  // Template send: record it in the contact log, then move any open outreach
  // list entries for this donor from "to contact" to "contacted" so campaign
  // progress tracks itself.
  async function handleTemplateLogSend({ template, subject }) {
    if (loggingTemplateSend || !displayedDonor?.email) return;

    loggingTemplateSend = true;
    errorMessage = "";

    const summary = subject
      ? `Sent "${template.title}" (subject: ${subject})`
      : `Sent "${template.title}"`;

    const { data, error } = await addInteraction(supabase, {
      donorEmail: displayedDonor.email,
      kind: "email",
      body: summary,
    });

    if (error) {
      errorMessage = error.message;
      loggingTemplateSend = false;
      return;
    }

    interactions = [data, ...interactions];

    const { error: outreachError } = await supabase
      .from("fundraising_outreach_items")
      .update({ status: "contacted" })
      .eq("donor_email", normalizeDonorEmail(displayedDonor.email))
      .eq("status", "to_contact");

    if (outreachError) {
      errorMessage = `Logged the email, but outreach lists could not be updated: ${outreachError.message}`;
    }

    loggingTemplateSend = false;
    onWorkspaceChanged();
  }

  function formatDate(value) {
    if (!value) return "n/a";
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

  function giftNet(gift) {
    return Number(gift.total_amount || 0) - Number(gift.refund_amount || 0);
  }
</script>

<SlideOver
  open={drawerOpen}
  title={donorTitle}
  eyebrow="Donor"
  closeLabel="Close donor details"
  onClose={requestClose}
  onClosed={handleClose}
>
  {#if displayedDonor}
    <div class="px-5 py-5">
      <div class="flex flex-wrap gap-2">
        <Badge tone="gold">
          <HandCoins class="h-3.5 w-3.5" aria-hidden="true" />
          {formatMoney(displayedDonor.total_given || 0)} lifetime
        </Badge>
        <Badge tone="neutral">
          {displayedDonor.gift_count || 0} gift{(displayedDonor.gift_count || 0) === 1 ? "" : "s"}
        </Badge>
        <Badge tone="neutral">
          <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
          Last gift {formatDate(displayedDonor.last_gift_date)}
        </Badge>
        {#if lastContact}
          <Badge tone="teal">Last contact {formatDateTime(lastContact.occurred_at)}</Badge>
        {/if}
        {#if ownerMember}
          <Badge tone="blue">Owner: {ownerMember.full_name || ownerMember.email}</Badge>
        {/if}
      </div>

      <div class="mt-4 space-y-1.5 text-sm text-ink/75">
        <p class="flex items-center gap-2">
          <Mail class="h-4 w-4 shrink-0 text-ink/40" aria-hidden="true" />
          <a class="truncate font-semibold text-accent-strong hover:underline" href={`mailto:${displayedDonor.email}`}>
            {displayedDonor.email}
          </a>
        </p>
        {#if displayedDonor.phone}
          <p class="flex items-center gap-2">
            <Phone class="h-4 w-4 shrink-0 text-ink/40" aria-hidden="true" />
            <a class="font-semibold text-accent-strong hover:underline" href={`tel:${displayedDonor.phone}`}>
              {displayedDonor.phone}
            </a>
          </p>
        {/if}
        {#if displayedDonor.company_name}
          <p class="text-ink/60">Company: {displayedDonor.company_name}</p>
        {/if}
      </div>

      <div class="mt-4">
        <Button
          size="sm"
          icon={UserPlus}
          onclick={() =>
            onAssignTask({
              sourceModule: "fundraising",
              sourceLabel: `Donor: ${donorTitle}`,
              sourceLink: "#fundraising",
              // "open:" namespace keeps manual tasks out of reach of the
              // workspace sync trigger, which owns bare fundraising_donor refs.
              sourceRef: `open:fundraising_donor:${normalizeDonorEmail(displayedDonor.email)}`,
              title: `Follow up with ${donorTitle}`,
              presets: DONOR_TASK_PRESETS.map((preset) => ({
                id: preset.id,
                label: preset.label,
                title: preset.title(donorTitle),
                note: preset.note(donorTitle),
              })),
            })}
        >
          Assign a task about this donor
        </Button>
      </div>

      {#if errorMessage}
        <Banner tone="error" message={errorMessage} class="mt-4" />
      {/if}

      <section class="mt-5 rounded-control border border-ink/8 bg-white p-4" aria-labelledby="donor-relationship-title">
        <h4 id="donor-relationship-title" class="font-bold text-ink">Relationship</h4>
        {#if profileLoading}
          <p class="mt-2 text-sm text-ink/55">Loading relationship info…</p>
        {:else}
          <form class="mt-3 space-y-3" onsubmit={saveProfile}>
            <Field label="Relationship owner" id="donor-owner" hint="Who on the team manages this donor. They'll see it in their Workspace.">
              <select id="donor-owner" class="select" bind:value={draftOwnerId} disabled={profileSaving}>
                <option value="">Unassigned</option>
                {#each teamMembers as member (member.id)}
                  <option value={member.id}>
                    {member.full_name || member.email}{member.id === currentUserId ? " (me)" : ""}
                  </option>
                {/each}
              </select>
            </Field>

            <div class="grid grid-cols-[1fr_auto] gap-3">
              <Field label="Next action" id="donor-next-action">
                <input
                  id="donor-next-action"
                  type="text"
                  class="input"
                  placeholder="e.g. Invite to the gala, schedule a call"
                  bind:value={draftNextAction}
                  disabled={profileSaving}
                />
              </Field>
              <Field label="By when" id="donor-next-action-date">
                <input
                  id="donor-next-action-date"
                  type="date"
                  class="input"
                  bind:value={draftNextActionDate}
                  disabled={profileSaving}
                />
              </Field>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <Field label="Preferred contact" id="donor-preferred-method">
                <select id="donor-preferred-method" class="select" bind:value={draftPreferredMethod} disabled={profileSaving}>
                  <option value="">Not set</option>
                  {#each CONTACT_METHODS as method (method.value)}
                    <option value={method.value}>{method.label}</option>
                  {/each}
                </select>
              </Field>
              <Field label="Capacity estimate" id="donor-capacity">
                <select id="donor-capacity" class="select" bind:value={draftCapacity} disabled={profileSaving}>
                  <option value="">Not set</option>
                  {#each CAPACITY_ESTIMATES as estimate (estimate.value)}
                    <option value={estimate.value}>{estimate.label}</option>
                  {/each}
                </select>
              </Field>
            </div>

            <Field label="Areas of interest" id="donor-areas">
              <input
                id="donor-areas"
                type="text"
                class="input"
                placeholder="Youth, wellness, equity, education…"
                bind:value={draftAreas}
                disabled={profileSaving}
              />
            </Field>

            <div class="grid grid-cols-2 gap-3">
              <Field label="Warm intro source" id="donor-warm-intro" hint="Who connected you?">
                <input
                  id="donor-warm-intro"
                  type="text"
                  class="input"
                  bind:value={draftWarmIntro}
                  disabled={profileSaving}
                />
              </Field>
              <Field label="Board connection" id="donor-board-connection" hint="Which board member knows them?">
                <input
                  id="donor-board-connection"
                  type="text"
                  class="input"
                  bind:value={draftBoardConnection}
                  disabled={profileSaving}
                />
              </Field>
            </div>

            <Button
              type="submit"
              variant="primary"
              class="w-full"
              loading={profileSaving}
              disabled={!profileDirty}
            >
              {profileSaving ? "Saving" : "Save relationship info"}
            </Button>
          </form>
        {/if}
      </section>

      <div class="mt-5">
        <TemplateMergePanel
          donor={displayedDonor}
          {templates}
          {currentUserName}
          logging={loggingTemplateSend}
          onLogSend={handleTemplateLogSend}
        />
      </div>

      <section class="mt-5 rounded-control border border-ink/8 bg-white p-4" aria-labelledby="donor-log-title">
        <h4 id="donor-log-title" class="font-bold text-ink">Contact log</h4>

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
            placeholder="e.g. Thanked her at the gala; interested in monthly giving."
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
              No contact logged yet. Log calls, emails, and event conversations so
              the next person knows where things stand.
            </p>
          {/if}
        </div>
      </section>

      <section class="mt-5 rounded-control border border-ink/8 bg-white p-4" aria-labelledby="donor-gifts-title">
        <h4 id="donor-gifts-title" class="font-bold text-ink">Gift history</h4>
        <div class="mt-3 space-y-2">
          {#if giftsLoading}
            <p class="text-sm text-ink/55">Loading gifts…</p>
          {:else if gifts.length}
            {#each gifts as gift (gift.id)}
              <article class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-canvas/40 px-3 py-2.5">
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-bold leading-snug text-ink">
                    {gift.campaign_title || "(no campaign)"}
                  </span>
                  <span class="mt-0.5 block text-xs font-semibold text-ink/50">
                    {formatDate(gift.payment_date)}
                    {#if gift.rate_title}
                      · {gift.rate_title}
                    {/if}
                    {#if gift.payment_status && gift.payment_status !== "Succeeded"}
                      · {gift.payment_status}
                    {/if}
                    {#if Number(gift.refund_amount) > 0}
                      · refunded {formatMoney(gift.refund_amount)}
                    {/if}
                  </span>
                  {#if gift.note}
                    <span class="mt-1 block text-xs leading-5 text-ink/60">“{gift.note}”</span>
                  {/if}
                  {#if gift.in_honor_of}
                    <span class="mt-1 block text-xs leading-5 text-ink/60">In honor of {gift.in_honor_of}</span>
                  {/if}
                </span>
                <span class="text-sm font-bold {giftNet(gift) > 0 ? 'text-ink' : 'text-ink/45'}">
                  {giftNet(gift) > 0 ? formatMoney(giftNet(gift)) : "Free"}
                </span>
              </article>
            {/each}
          {:else}
            <p class="text-sm text-ink/55">No recorded gifts for this email.</p>
          {/if}
        </div>
      </section>

      <div class="mt-5 border-t border-ink/8 pt-4">
        <Button variant="secondary" class="w-full" onclick={requestClose}>Close</Button>
      </div>
    </div>
  {/if}
</SlideOver>
