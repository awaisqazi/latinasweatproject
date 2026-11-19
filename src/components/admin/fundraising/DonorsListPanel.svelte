<script>
  // Donor Engagement > Donors: every donor on record with search, segments,
  // sort, paging and a CSV export of the current list. The filters are bound
  // to FundraisingView so they survive switching sub-tabs.
  import {
    CalendarClock,
    ChevronLeft,
    ChevronRight,
    Download,
    Search,
    UserRound,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import { formatMoney } from "../../../lib/dashboard/fundraising";
  import {
    DONOR_SEGMENTS,
    donorMatchesSegment,
    loadGalaDonorEmails,
  } from "../../../lib/dashboard/donorSegments";
  import { dateStamp, downloadCsv, slugForFilename } from "../../../lib/dashboard/csv";
  import {
    CAPACITY_ESTIMATES,
    CONTACT_METHODS,
  } from "../../../lib/dashboard/fundraisingCrm";

  export let supabase;
  export let profile = null;
  export let teamMembers = [];
  export let donorSummaries = [];
  export let donorProfiles = [];
  export let search = "";
  export let sort = "total";
  export let segment = "all";
  export let page = 0;
  export let galaEmails = null; // Set of emails, cached by the parent
  export let onOpenDonor = () => {};

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const PAGE_SIZE = 100;

  let galaLoading = false;
  let galaLoadFailed = false;
  let galaError = "";
  let lastFilterKey = null;

  $: profilesByEmail = Object.fromEntries(
    donorProfiles.map((donorProfile) => [donorProfile.email, donorProfile]),
  );
  $: membersById = Object.fromEntries(teamMembers.map((member) => [member.id, member]));
  $: if (segment === "gala" && galaEmails === null && !galaLoading && !galaLoadFailed) {
    fetchGalaEmails();
  }
  $: segmentContext = {
    profileId: profile?.id || "",
    profilesByEmail,
    emailSet: galaEmails || new Set(),
  };
  $: filteredDonors = filterDonors(donorSummaries, search, sort, segment, segmentContext);
  // Any filter change jumps back to the first page (coming back to the tab
  // keeps the page you were on).
  $: filterKey = `${search}|${sort}|${segment}`;
  $: if (filterKey !== lastFilterKey) {
    if (lastFilterKey !== null) page = 0;
    lastFilterKey = filterKey;
  }
  $: totalPages = Math.max(1, Math.ceil(filteredDonors.length / PAGE_SIZE));
  $: if (page > totalPages - 1) page = totalPages - 1;
  $: pagedDonors = filteredDonors.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function fetchGalaEmails() {
    galaLoading = true;
    galaLoadFailed = false;
    galaError = "";
    const { emails, error } = await loadGalaDonorEmails(supabase);
    if (error) {
      // Don't cache a partial set as the answer; the chip can be re-clicked.
      galaLoadFailed = true;
      galaEmails = null;
      galaError = `Couldn't load gala donors: ${error.message}`;
    } else {
      galaEmails = emails;
    }
    galaLoading = false;
  }

  function filterDonors(list, query, order, segmentId, context) {
    const needle = query.trim().toLowerCase();
    let result = list.filter((donor) => donorMatchesSegment(donor, segmentId, context));

    if (needle) {
      result = result.filter((donor) =>
        [donor.donor_name, donor.email, donor.company_name, donor.phone]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }

    return result.slice().sort((a, b) => {
      if (order === "recent") {
        return (b.last_gift_date || "").localeCompare(a.last_gift_date || "");
      }
      if (order === "name") {
        return (a.donor_name || a.email || "").localeCompare(b.donor_name || b.email || "");
      }
      return Number(b.total_given || 0) - Number(a.total_given || 0);
    });
  }

  function donorLabel(donor) {
    return donor.donor_name || donor.company_name || donor.email;
  }

  function ownerLabelFor(donor, profiles, members) {
    const ownerId = profiles[donor.email]?.owner_id;
    if (!ownerId) return "";
    const member = members[ownerId];
    return member?.full_name || member?.email || "";
  }

  function optionLabel(options, value) {
    return options.find((option) => option.value === value)?.label || "";
  }

  function daysAgoLabel(value) {
    if (!value) return "Never";
    const then = new Date(`${value}T00:00:00`);
    const days = Math.floor((Date.now() - then.getTime()) / MS_PER_DAY);
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }

  // Exports respect whatever segment/search/sort is active, so "everything"
  // is just the export with no filters applied.
  function exportDonorsCsv() {
    const rows = filteredDonors.map((donor) => {
      const donorProfile = profilesByEmail[donor.email];
      return [
        donor.donor_name || "",
        donor.email,
        donor.company_name || "",
        donor.phone || "",
        Number(donor.total_given || 0).toFixed(2),
        donor.gift_count || 0,
        donor.first_gift_date || "",
        donor.last_gift_date || "",
        ownerLabelFor(donor, profilesByEmail, membersById),
        donorProfile?.next_action || "",
        donorProfile?.next_action_date || "",
        optionLabel(CONTACT_METHODS, donorProfile?.preferred_contact_method),
        optionLabel(CAPACITY_ESTIMATES, donorProfile?.capacity_estimate),
        donorProfile?.areas_of_interest || "",
        donorProfile?.warm_intro_source || "",
        donorProfile?.board_connection || "",
      ];
    });

    downloadCsv(
      `lsp-donors-${slugForFilename(segment)}-${dateStamp()}.csv`,
      [
        "Name", "Email", "Company", "Phone", "Lifetime giving", "Gifts",
        "First gift", "Last gift", "Relationship owner", "Next action",
        "Next action date", "Preferred contact", "Capacity estimate",
        "Areas of interest", "Warm intro source", "Board connection",
      ],
      rows,
    );
  }
</script>

<Panel title="Donors" id="fundraising-donors-title">
  {#if galaError}
    <div class="mb-3">
      <Banner tone="error" message={galaError} />
    </div>
  {/if}

  <div class="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Donor segments">
    {#each DONOR_SEGMENTS as option (option.id)}
      <button
        type="button"
        class="rounded-full border px-3 py-1 text-xs font-bold transition {segment === option.id
          ? 'border-accent bg-accent/10 text-accent-strong'
          : 'border-ink/12 bg-white text-ink/60 hover:border-accent/40'}"
        aria-pressed={segment === option.id}
        onclick={() => {
          if (option.id === "gala") {
            galaLoadFailed = false;
            galaError = "";
          }
          segment = option.id;
        }}
      >
        {option.label}
      </button>
    {/each}
  </div>

  <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
    <label class="relative block">
      <span class="sr-only">Search donors</span>
      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
      <input
        type="search"
        class="input pl-9"
        placeholder="Search by name, email, company, or phone"
        bind:value={search}
      />
    </label>
    <label class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50 sm:w-48">
      <span class="sr-only">Sort donors</span>
      <select class="select" bind:value={sort} aria-label="Sort donors">
        <option value="total">Top lifetime giving</option>
        <option value="recent">Most recent gift</option>
        <option value="name">Name A→Z</option>
      </select>
    </label>
    <Button
      icon={Download}
      disabled={!filteredDonors.length}
      title="Download the current list (with filters applied) as a CSV"
      onclick={exportDonorsCsv}
    >
      Export CSV
    </Button>
  </div>

  {#if segment === "gala" && galaLoading}
    <p class="mb-3 text-sm text-ink/55">Finding gala donors…</p>
  {/if}

  <p class="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink/50">
    {filteredDonors.length.toLocaleString()} of {donorSummaries.length.toLocaleString()} donors
  </p>

  {#if filteredDonors.length}
    <div class="space-y-2">
      {#each pagedDonors as donor (donor.email)}
        {@const ownerLabel = ownerLabelFor(donor, profilesByEmail, membersById)}
        <button
          type="button"
          class="flex w-full flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40 hover:shadow-card"
          onclick={() => onOpenDonor(donor)}
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate font-bold leading-snug text-ink">{donorLabel(donor)}</span>
            <span class="mt-0.5 block truncate text-xs text-ink/55">{donor.email}</span>
          </span>
          {#if ownerLabel}
            <Badge tone="blue" size="xs">
              <UserRound class="h-3 w-3" aria-hidden="true" />
              {ownerLabel}
            </Badge>
          {/if}
          <Badge tone="neutral" size="xs">
            {donor.gift_count || 0} gift{(donor.gift_count || 0) === 1 ? "" : "s"}
          </Badge>
          <Badge tone="neutral" size="xs">
            <CalendarClock class="h-3 w-3" aria-hidden="true" />
            {daysAgoLabel(donor.last_gift_date)}
          </Badge>
          <span class="w-24 shrink-0 text-right text-sm font-bold text-ink">
            {formatMoney(donor.total_given || 0)}
          </span>
        </button>
      {/each}
      {#if totalPages > 1}
        <div class="flex flex-wrap items-center justify-between gap-3 rounded-control border border-ink/8 bg-white px-4 py-3">
          <p class="text-xs font-semibold text-ink/55">
            Showing {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min(
              (page + 1) * PAGE_SIZE,
              filteredDonors.length,
            ).toLocaleString()} of {filteredDonors.length.toLocaleString()}
          </p>
          <div class="flex items-center gap-2">
            <Button size="sm" icon={ChevronLeft} disabled={page === 0} onclick={() => (page -= 1)}>
              Previous
            </Button>
            <span class="text-xs font-bold text-ink/60">
              Page {page + 1} of {totalPages}
            </span>
            <Button size="sm" icon={ChevronRight} disabled={page >= totalPages - 1} onclick={() => (page += 1)}>
              Next
            </Button>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <EmptyState title="No matching donors" message="Try a different search term or segment." />
  {/if}
</Panel>
