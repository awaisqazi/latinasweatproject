<script>
  // Segment-based donor picker for outreach campaigns: filter the donor list
  // by a segment chip (gala donors, lapsed, $500+…) and search, tick the ones
  // to include, optionally hand them straight to a teammate, and add them to
  // the campaign in one write. Already-added donors are shown but locked.
  import { Check, Search, UsersRound } from "@lucide/svelte";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import { formatMoney } from "../../../lib/dashboard/fundraising";
  import { addOutreachItems } from "../../../lib/dashboard/fundraisingCrm";
  import {
    DONOR_SEGMENTS,
    donorMatchesSegment,
    loadGalaDonorEmails,
  } from "../../../lib/dashboard/donorSegments";

  export let supabase;
  export let open = false;
  export let campaign = null;
  export let donorSummaries = [];
  export let donorProfiles = [];
  export let teamMembers = [];
  export let profileId = "";
  export let existingEmails = new Set();
  export let onClose = () => {};
  export let onAdded = () => {};

  const LIST_CAP = 200;

  let segmentId = "all";
  let search = "";
  let selectedEmails = new Set();
  let assigneeId = "";
  let adding = false;
  let errorMessage = "";
  let galaEmails = null;
  let galaLoading = false;
  let galaLoadFailed = false;
  let lastOpen = false;

  $: if (open && !lastOpen) {
    lastOpen = true;
    segmentId = "all";
    search = "";
    selectedEmails = new Set();
    assigneeId = "";
    errorMessage = "";
  } else if (!open && lastOpen) {
    lastOpen = false;
  }

  $: profilesByEmail = Object.fromEntries(
    donorProfiles.map((profile) => [profile.email, profile]),
  );
  $: if (open && segmentId === "gala" && galaEmails === null && !galaLoading && !galaLoadFailed) {
    fetchGalaEmails();
  }
  $: segmentContext = { profileId, profilesByEmail, emailSet: galaEmails || new Set() };
  $: matchingDonors = filterDonors(donorSummaries, segmentId, search, segmentContext);
  $: shownDonors = matchingDonors.slice(0, LIST_CAP);
  $: selectableShown = shownDonors.filter((donor) => !existingEmails.has(donor.email));
  $: allShownSelected =
    selectableShown.length > 0 &&
    selectableShown.every((donor) => selectedEmails.has(donor.email));

  async function fetchGalaEmails() {
    galaLoading = true;
    galaLoadFailed = false;
    if (errorMessage.startsWith("Couldn't load gala donors")) errorMessage = "";
    const { emails, error } = await loadGalaDonorEmails(supabase);
    if (error) {
      // Don't cache a partial set as the answer; re-picking the chip retries.
      errorMessage = `Couldn't load gala donors: ${error.message}`;
      galaLoadFailed = true;
      galaEmails = null;
    } else {
      galaEmails = emails;
    }
    galaLoading = false;
  }

  function filterDonors(list, segment, query, context) {
    const trimmed = query.trim().toLowerCase();
    let result = list.filter((donor) => donorMatchesSegment(donor, segment, context));

    if (trimmed) {
      result = result.filter((donor) =>
        [donor.donor_name, donor.email, donor.company_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(trimmed),
      );
    }
    return result;
  }

  function donorLabel(donor) {
    return donor.donor_name || donor.company_name || donor.email;
  }

  function toggleDonor(email) {
    const next = new Set(selectedEmails);
    if (next.has(email)) {
      next.delete(email);
    } else {
      next.add(email);
    }
    selectedEmails = next;
  }

  function toggleSelectAllShown() {
    const next = new Set(selectedEmails);
    if (allShownSelected) {
      for (const donor of selectableShown) next.delete(donor.email);
    } else {
      for (const donor of selectableShown) next.add(donor.email);
    }
    selectedEmails = next;
  }

  async function handleAdd() {
    if (!campaign?.id || !selectedEmails.size || adding) return;

    adding = true;
    errorMessage = "";

    const donors = donorSummaries
      .filter((donor) => selectedEmails.has(donor.email))
      .map((donor) => ({ email: donor.email, name: donorLabel(donor) }));

    const { data, error } = await addOutreachItems(
      supabase,
      campaign.id,
      donors,
      assigneeId || null,
    );

    adding = false;

    if (error) {
      errorMessage = error.message;
      return;
    }

    onAdded(data || []);
    onClose();
  }
</script>

<SlideOver
  {open}
  title={campaign ? `Add donors to ${campaign.name}` : "Add donors"}
  eyebrow="Outreach"
  closeLabel="Close donor picker"
  closeDisabled={adding}
  onClose={onClose}
>
  <div class="space-y-4 px-5 py-5">
    {#if errorMessage}
      <Banner tone="error" message={errorMessage} />
    {/if}

    <div class="flex flex-wrap gap-1.5" role="group" aria-label="Donor segments">
      {#each DONOR_SEGMENTS as segment (segment.id)}
        <button
          type="button"
          class="rounded-full border px-3 py-1 text-xs font-bold transition {segmentId === segment.id
            ? 'border-accent bg-accent/10 text-accent-strong'
            : 'border-ink/12 bg-white text-ink/60 hover:border-accent/40'}"
          aria-pressed={segmentId === segment.id}
          onclick={() => {
            if (segment.id === "gala") galaLoadFailed = false;
            segmentId = segment.id;
          }}
        >
          {segment.label}
        </button>
      {/each}
    </div>

    <label class="relative block">
      <span class="sr-only">Search donors</span>
      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
      <input
        type="search"
        class="input pl-9"
        placeholder="Search by name, email, or company"
        bind:value={search}
      />
    </label>

    {#if segmentId === "gala" && galaLoading}
      <p class="text-sm text-ink/55">Finding gala donors…</p>
    {:else if shownDonors.length}
      <div class="flex flex-wrap items-center justify-between gap-2">
        {#if selectableShown.length}
          <label class="flex items-center gap-2 text-xs font-semibold text-ink/55">
            <input
              type="checkbox"
              class="checkbox"
              checked={allShownSelected}
              onchange={toggleSelectAllShown}
            />
            Select all {selectableShown.length} shown
          </label>
        {:else}
          <p class="text-xs font-semibold text-ink/50">
            Everyone shown is already on this list.
          </p>
        {/if}
        <p class="text-xs font-semibold text-ink/50">
          {matchingDonors.length.toLocaleString()} match{matchingDonors.length === 1 ? "" : "es"}
          {#if matchingDonors.length > LIST_CAP}
            · showing first {LIST_CAP}, refine the search for the rest
          {/if}
        </p>
      </div>

      <div class="max-h-96 space-y-1.5 overflow-y-auto pr-1">
        {#each shownDonors as donor (donor.email)}
          {#if existingEmails.has(donor.email)}
            <div class="flex items-center gap-3 rounded-control border border-ink/6 bg-canvas/50 px-3 py-2 opacity-60">
              <Check class="h-4 w-4 shrink-0 text-ink/40" aria-hidden="true" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold text-ink/60">{donorLabel(donor)}</span>
                <span class="block truncate text-xs text-ink/45">{donor.email}</span>
              </span>
              <Badge tone="neutral" size="xs">Already added</Badge>
            </div>
          {:else}
            <label class="flex cursor-pointer items-center gap-3 rounded-control border border-ink/8 bg-white px-3 py-2 transition hover:border-accent/40">
              <input
                type="checkbox"
                class="checkbox"
                checked={selectedEmails.has(donor.email)}
                onchange={() => toggleDonor(donor.email)}
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold text-ink">{donorLabel(donor)}</span>
                <span class="block truncate text-xs text-ink/50">{donor.email}</span>
              </span>
              <span class="text-xs font-bold text-ink/60">{formatMoney(donor.total_given || 0)}</span>
            </label>
          {/if}
        {/each}
      </div>
    {:else}
      <EmptyState
        icon={UsersRound}
        title="No donors match"
        message="Try a different segment or search term."
      />
    {/if}

    <div class="space-y-3 border-t border-ink/8 pt-4">
      <label class="block">
        <span class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
          Assign these donors to (optional)
        </span>
        <select class="select mt-1.5" bind:value={assigneeId}>
          <option value="">Leave unassigned for now</option>
          {#each teamMembers as member (member.id)}
            <option value={member.id}>
              {member.full_name || member.email}{member.id === profileId ? " (me)" : ""}
            </option>
          {/each}
        </select>
      </label>

      <Button
        variant="primary"
        class="w-full"
        loading={adding}
        disabled={!selectedEmails.size}
        onclick={handleAdd}
      >
        {adding
          ? "Adding"
          : `Add ${selectedEmails.size || ""} donor${selectedEmails.size === 1 ? "" : "s"} to the list`}
      </Button>
    </div>
  </div>
</SlideOver>
