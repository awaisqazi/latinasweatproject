<script>
  import { onMount } from "svelte";
  import {
    ArrowUpRight,
    CircleAlert,
    HandCoins,
    PiggyBank,
    UserCheck,
    Users,
  } from "@lucide/svelte";
  import EmptyState from "../marketing/EmptyState.svelte";
  import Panel from "../marketing/Panel.svelte";
  import SummaryCard from "../marketing/SummaryCard.svelte";

  export let supabase;
  export let profile = null;
  export let refreshKey = 0;

  const base = import.meta.env.BASE_URL || "/";
  const galaToolsUrl = `${base.endsWith("/") ? base : `${base}/`}admin/gala`;

  let guestCount = 0;
  let checkedInCount = 0;
  let donations = [];
  let isLoading = true;
  let errorMessage = "";
  let lastRefreshKey = refreshKey;

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadData();
  }

  $: totalRaised = donations.reduce(
    (sum, donation) => sum + (Number(donation.amount) || 0),
    0,
  );
  $: recentDonations = donations.slice(0, 10);
  $: hasAnyData = guestCount > 0 || donations.length > 0;

  onMount(() => {
    loadData();
  });

  async function loadData() {
    if (!supabase) return;

    isLoading = true;
    errorMessage = "";

    const [guestsResult, donationsResult] = await Promise.all([
      supabase.from("gala_guests").select("id, checked_in"),
      supabase
        .from("gala_donations_public")
        .select("id, amount, donor_name, paddle_number, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (guestsResult.error) {
      errorMessage = guestsResult.error.message;
    } else {
      const guests = guestsResult.data || [];
      guestCount = guests.length;
      checkedInCount = guests.filter((guest) => guest.checked_in).length;
    }

    if (donationsResult.error) {
      errorMessage = errorMessage || donationsResult.error.message;
    } else {
      donations = donationsResult.data || [];
    }

    isLoading = false;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  }
</script>

<section class="space-y-4" aria-labelledby="gala-view-title">
  <h3 id="gala-view-title" class="sr-only">Gala</h3>

  {#if errorMessage}
    <div class="flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{errorMessage}</span>
    </div>
  {/if}

  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <SummaryCard label="Guests" value={guestCount} icon={Users} tone="gold" />
    <SummaryCard label="Checked in" value={checkedInCount} icon={UserCheck} tone="teal" />
    <SummaryCard label="Donations" value={donations.length} icon={HandCoins} tone="gold" />
    <SummaryCard label="Total raised" value={formatCurrency(totalRaised)} icon={PiggyBank} tone="teal" />
  </div>

  <a
    href={galaToolsUrl}
    class="group flex flex-wrap items-center gap-4 rounded-lg border border-black/10 bg-[#1E1E1E] p-4 text-white shadow-sm transition hover:border-[#ffbd59]/60 md:p-5"
  >
    <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#ffbd59] text-[#1E1E1E]">
      <HandCoins class="h-5 w-5" aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block text-lg font-bold leading-snug">Open the full gala toolkit</span>
      <span class="mt-0.5 block text-sm text-white/70">
        Check-in station, paddle manager, donation terminal, and live overview.
      </span>
    </span>
    <span class="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition group-hover:bg-[#f4a833]">
      Gala tools
      <ArrowUpRight class="h-4 w-4" aria-hidden="true" />
    </span>
  </a>

  <Panel title="Recent donations" id="gala-recent-donations-panel" loading={isLoading}>
    {#if isLoading}
      <div class="flex min-h-40 items-center justify-center">
        <div class="flex items-center gap-3 text-sm text-gray-600">
          <span class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin" aria-hidden="true"></span>
          Loading gala data
        </div>
      </div>
    {:else if !recentDonations.length}
      <EmptyState
        title={hasAnyData ? "No donations yet" : "No gala data yet"}
        message={hasAnyData
          ? "Donations will appear here as soon as they are recorded in the donation terminal."
          : "Nothing to show. Either no gala data has been entered yet, or your account does not have the gala module. Ask an admin if you expect access."}
      />
    {:else}
      <ul class="divide-y divide-gray-100">
        {#each recentDonations as donation (donation.id)}
          <li class="flex flex-wrap items-center gap-3 py-2.5">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-bold text-gray-900">
                {donation.donor_name || "Anonymous"}
                {#if donation.paddle_number}
                  <span class="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-gray-600">
                    #{donation.paddle_number}
                  </span>
                {/if}
              </p>
              <p class="mt-0.5 text-xs text-gray-500">{formatDateTime(donation.created_at)}</p>
            </div>
            <span class="text-sm font-bold text-[#0f766e]">{formatCurrency(donation.amount)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </Panel>
</section>
