<script>
  // Compact card: a couple of reference numbers from the frozen Gala 2025
  // archive tables, plus the two doors into the real 2026 tooling (ticket
  // G7). The 2026 ops console mints its own admin session against the new
  // gala_checkin_* RPCs, so this card does not need Supabase reads beyond
  // the legacy summary it already had; it is intentionally not the place
  // that shows live 2026 numbers (that is /admin/gala's Overview tab).
  //
  // Legacy Svelte mode, unchanged (house gotcha: state read inside a helper
  // called from the template or from `$:` is not tracked, so every value
  // the markup shows below is a plain top-level `$:` or `let`, never wrapped
  // in a function).
  import { onMount } from "svelte";
  import { ArrowUpRight, HandCoins, Lock, Users } from "@lucide/svelte";
  import Banner from "../ui/Banner.svelte";
  import StatCard from "../ui/StatCard.svelte";

  export let supabase;
  export let profile = null;
  export let refreshKey = 0;

  const base = import.meta.env.BASE_URL || "/";
  const withBase = (path) => `${base.endsWith("/") ? base : `${base}/`}${path}`;
  const opsConsoleUrl = withBase("admin/gala");
  const archiveUrl = withBase("admin/gala?event=gala-2025");

  let guestCount = 0;
  let donationCount = 0;
  let totalRaised = 0;
  let isLoading = true;
  let errorMessage = "";
  let lastRefreshKey = refreshKey;

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadData();
  }

  onMount(() => {
    loadData();
  });

  async function loadData() {
    if (!supabase) return;

    isLoading = true;
    errorMessage = "";

    const [guestsResult, donationsResult] = await Promise.all([
      supabase.from("gala_guests").select("id", { count: "exact", head: true }),
      supabase.from("gala_donations_public").select("amount"),
    ]);

    if (guestsResult.error) {
      errorMessage = guestsResult.error.message;
    } else {
      guestCount = guestsResult.count || 0;
    }

    if (donationsResult.error) {
      errorMessage = errorMessage || donationsResult.error.message;
    } else {
      const rows = donationsResult.data || [];
      donationCount = rows.length;
      totalRaised = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
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
</script>

<section class="space-y-4" aria-labelledby="gala-view-title">
  <h3 id="gala-view-title" class="sr-only">Gala</h3>

  {#if errorMessage}
    <Banner tone="error" message={errorMessage} />
  {/if}

  <div class="grid gap-3 sm:grid-cols-3">
    <StatCard label="Gala 2025 guests" value={guestCount} icon={Users} tone="gold" loading={isLoading} />
    <StatCard label="Gala 2025 gifts" value={donationCount} icon={HandCoins} tone="teal" loading={isLoading} />
    <StatCard label="Gala 2025 total" value={formatCurrency(totalRaised)} icon={HandCoins} tone="gold" loading={isLoading} />
  </div>

  <div class="rounded-card border border-ink/8 bg-ink p-4 text-white shadow-card md:p-5">
    <p class="text-xs font-bold uppercase tracking-[0.16em] text-white/60">The Latina Sweat Project</p>
    <p class="mt-1 text-lg font-bold leading-snug">Annual Gala toolkit</p>
    <p class="mt-1 text-sm text-white/70">
      Check-in, pledges, the big screen, and paddles for Gala 2026 live in the ops console. Gala 2025 is a
      read-only archive.
    </p>
    <div class="mt-3 flex flex-wrap gap-2">
      <a
        href={opsConsoleUrl}
        class="group inline-flex min-h-10 items-center gap-2 rounded-control bg-brand px-4 text-sm font-bold text-ink transition hover:bg-brand-strong"
      >
        Open ops console
        <ArrowUpRight class="h-4 w-4" aria-hidden="true" />
      </a>
      <a
        href={archiveUrl}
        class="inline-flex min-h-10 items-center gap-2 rounded-control border border-white/20 px-4 text-sm font-bold text-white transition hover:border-white/40"
      >
        <Lock class="h-3.5 w-3.5" aria-hidden="true" />
        Gala 2025 archive
      </a>
    </div>
  </div>
</section>
