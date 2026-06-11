<script>
  import { onMount } from "svelte";
  import {
    ArrowUpRight,
    HandCoins,
    PiggyBank,
    UserCheck,
    Users,
  } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import Skeleton from "../ui/Skeleton.svelte";
  import StatCard from "../ui/StatCard.svelte";

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
    <Banner tone="error" message={errorMessage} />
  {/if}

  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Guests" value={guestCount} icon={Users} tone="gold" loading={isLoading} />
    <StatCard label="Checked in" value={checkedInCount} icon={UserCheck} tone="teal" loading={isLoading} />
    <StatCard label="Donations" value={donations.length} icon={HandCoins} tone="gold" loading={isLoading} />
    <StatCard label="Total raised" value={formatCurrency(totalRaised)} icon={PiggyBank} tone="teal" loading={isLoading} />
  </div>

  <a
    href={galaToolsUrl}
    class="group flex flex-wrap items-center gap-4 rounded-card border border-ink/8 bg-ink p-4 text-white shadow-card transition hover:border-brand/60 md:p-5"
  >
    <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-control bg-brand text-ink">
      <HandCoins class="h-5 w-5" aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block text-lg font-bold leading-snug">Open the full gala toolkit</span>
      <span class="mt-0.5 block text-sm text-white/70">
        Check-in station, paddle manager, donation terminal, and live overview.
      </span>
    </span>
    <span class="inline-flex min-h-10 items-center gap-2 rounded-control bg-brand px-4 text-sm font-bold text-ink transition group-hover:bg-brand-strong">
      Gala tools
      <ArrowUpRight class="h-4 w-4" aria-hidden="true" />
    </span>
  </a>

  <Panel title="Recent donations" id="gala-recent-donations-panel" loading={isLoading}>
    {#if isLoading}
      <div class="divide-y divide-ink/8">
        {#each Array(4) as _, i (i)}
          <div class="flex items-center justify-between gap-3 py-3">
            <div class="min-w-0 flex-1">
              <Skeleton variant="text" class="w-2/5" />
              <Skeleton variant="text" class="mt-2 w-1/4" />
            </div>
            <Skeleton variant="text" class="w-14" />
          </div>
        {/each}
      </div>
    {:else if !recentDonations.length}
      <EmptyState
        title={hasAnyData ? "No donations yet" : "No gala data yet"}
        message={hasAnyData
          ? "Donations will appear here as soon as they are recorded in the donation terminal."
          : "Nothing to show. Either no gala data has been entered yet, or your account does not have the gala module. Ask an admin if you expect access."}
      />
    {:else}
      <ul class="divide-y divide-ink/8">
        {#each recentDonations as donation (donation.id)}
          <li class="flex flex-wrap items-center gap-3 py-2.5">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-bold text-ink">
                {donation.donor_name || "Anonymous"}
                {#if donation.paddle_number}
                  <Badge tone="neutral" size="xs" class="ml-1.5 font-mono align-middle">
                    #{donation.paddle_number}
                  </Badge>
                {/if}
              </p>
              <p class="mt-0.5 text-xs text-ink/50">{formatDateTime(donation.created_at)}</p>
            </div>
            <span class="text-sm font-bold text-accent-strong">{formatCurrency(donation.amount)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </Panel>
</section>
