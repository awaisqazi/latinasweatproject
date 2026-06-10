<script>
    import { onMount } from "svelte";
    import PaddleManager from "./PaddleManager.svelte";
    import CheckInStation from "./CheckInStation.svelte";
    import DonationTerminal from "./DonationTerminal.svelte";
    import GalaOverview from "./GalaOverview.svelte";
    import DonationManager from "./DonationManager.svelte";

    import {
        supabase,
        SUPABASE_CONFIG_ERROR,
    } from "../../lib/supabaseClient";

    // State
    let session = null;
    let authChecked = false;
    let configError = SUPABASE_CONFIG_ERROR;
    let moduleWarning = false;
    let activeTab = "overview"; // 'overview', 'checkin', 'paddle', 'donations'

    $: isAuthenticated = Boolean(session);

    // If the signed-in account lacks the gala module, RLS returns zero rows
    // everywhere with no error. Probe both tables so we can hint at the cause.
    async function probeGalaAccess() {
        if (!supabase) return;
        try {
            const [guestsRes, donationsRes] = await Promise.all([
                supabase
                    .from("gala_guests")
                    .select("id", { count: "exact", head: true }),
                supabase
                    .from("gala_donations")
                    .select("id", { count: "exact", head: true }),
            ]);
            moduleWarning =
                (guestsRes.count || 0) === 0 &&
                (donationsRes.count || 0) === 0;
        } catch {
            moduleWarning = false;
        }
    }

    onMount(() => {
        if (!supabase) {
            authChecked = true;
            return;
        }

        supabase.auth.getSession().then(({ data }) => {
            session = data?.session || null;
            authChecked = true;
            if (session) probeGalaAccess();
        });

        const { data: listener } = supabase.auth.onAuthStateChange(
            (_event, newSession) => {
                const hadSession = Boolean(session);
                session = newSession;
                authChecked = true;
                if (session && !hadSession) probeGalaAccess();
            },
        );

        return () => listener?.subscription?.unsubscribe();
    });

    async function handleLogout() {
        if (supabase) {
            await supabase.auth.signOut();
        }
        session = null;
    }

    // Navigation Items
    const navItems = [
        { id: "overview", label: "Overview", icon: "📊" },
        { id: "checkin", label: "Check-In", icon: "✅" },
        { id: "paddle", label: "Paddle Management", icon: "🔢" },
        { id: "donations", label: "Live Donations", icon: "💰" },
        { id: "transactions", label: "Transactions", icon: "🧾" },
    ];
</script>

<div class="min-h-screen bg-[var(--color-light-gray)]">
    {#if !authChecked}
        <!-- Checking session -->
        <div class="flex flex-col items-center justify-center min-h-screen p-8">
            <p class="text-[var(--color-medium-gray)]">Checking session...</p>
        </div>
    {:else if !isAuthenticated}
        <!-- Sign-in Required Screen -->
        <div class="flex flex-col items-center justify-center min-h-screen p-8">
            <div
                class="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center"
            >
                <h2
                    class="text-2xl font-bold text-[var(--color-off-black)] mb-4"
                >
                    Gala Admin Access
                </h2>
                {#if configError}
                    <div
                        class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm"
                    >
                        {configError}
                    </div>
                {/if}
                <p class="text-[var(--color-medium-gray)] mb-6">
                    Sign in to the team dashboard to use gala tools
                </p>
                <a
                    href="/admin/marketing/login?redirectTo=/admin/gala"
                    class="inline-block w-full bg-[var(--color-vibrant-pink)] text-white font-bold py-2 px-4 rounded-md hover:opacity-90 transition-opacity"
                >
                    Go to Dashboard Login
                </a>
            </div>
        </div>
    {:else}
        <!-- Dashboard Shell -->
        <div class="flex min-h-screen">
            <!-- Full height for dashboard feel -->
            <!-- Sidebar -->
            <aside class="w-64 bg-white border-r border-gray-200 flex flex-col">
                <div class="p-6 border-b border-gray-100">
                    <h2
                        class="text-xl font-bold text-[var(--color-vibrant-pink)]"
                    >
                        Gala Admin
                    </h2>
                    <p class="text-xs text-gray-400 mt-1">
                        Operations Dashboard
                    </p>
                </div>

                <nav class="flex-1 p-4 space-y-2">
                    {#each navItems as item}
                        <button
                            on:click={() => (activeTab = item.id)}
                            class="w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors {activeTab ===
                            item.id
                                ? 'bg-[var(--color-vibrant-pink)] text-white shadow-md'
                                : 'text-[var(--color-medium-gray)] hover:bg-gray-50'}"
                        >
                            <span>{item.icon}</span>
                            <span class="font-medium">{item.label}</span>
                        </button>
                    {/each}
                </nav>

                <div class="p-4 border-t border-gray-100">
                    <button
                        on:click={handleLogout}
                        class="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <span>🚪</span>
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            <!-- Main Content -->
            <main
                class="flex-1 overflow-y-auto bg-[var(--color-light-gray)] p-8"
            >
                <header class="flex justify-between items-center mb-8">
                    <h1
                        class="text-2xl font-bold text-[var(--color-off-black)]"
                    >
                        {navItems.find((i) => i.id === activeTab)?.label}
                    </h1>
                    <div class="text-sm text-[var(--color-medium-gray)]">
                        {new Date().toLocaleDateString()}
                    </div>
                </header>

                {#if moduleWarning}
                    <div
                        class="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg mb-6 text-sm"
                    >
                        No gala data is visible to this account. If you expect
                        to see guests or donations, your account may not have
                        the gala module enabled. Ask a dashboard admin to grant
                        it.
                    </div>
                {/if}

                <!-- Dynamic Content -->
                <div class="bg-white rounded-xl shadow-sm p-6 min-h-[500px]">
                    {#if activeTab === "overview"}
                        <GalaOverview />
                    {:else if activeTab === "checkin"}
                        <CheckInStation />
                    {:else if activeTab === "paddle"}
                        <PaddleManager />
                    {:else if activeTab === "donations"}
                        <DonationTerminal />
                    {:else if activeTab === "transactions"}
                        <DonationManager />
                    {/if}
                </div>
            </main>
        </div>
    {/if}
</div>
