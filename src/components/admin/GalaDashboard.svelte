<script>
    import { onMount } from "svelte";
    import PaddleManager from "./PaddleManager.svelte";
    import CheckInStation from "./CheckInStation.svelte";
    import DonationTerminal from "./DonationTerminal.svelte";
    import GalaOverview from "./GalaOverview.svelte";
    import DonationManager from "./DonationManager.svelte";

    // State
    let isAuthenticated = false;
    let passwordInput = "";
    let error = "";
    let activeTab = "overview"; // 'overview', 'checkin', 'paddle', 'donations'

    // Password Check
    function handleLogin() {
        if (passwordInput === "XavierLSP123!") {
            isAuthenticated = true;
            error = "";
            // Persist session if needed, but for now simple state is fine
            sessionStorage.setItem("galaAdminAuth", "true");
        } else {
            error = "Incorrect password";
        }
    }

    onMount(() => {
        if (sessionStorage.getItem("galaAdminAuth") === "true") {
            isAuthenticated = true;
        }
    });

    function handleLogout() {
        isAuthenticated = false;
        sessionStorage.removeItem("galaAdminAuth");
        passwordInput = "";
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
    {#if !isAuthenticated}
        <!-- Login Screen -->
        <div class="flex flex-col items-center justify-center min-h-screen p-8">
            <div class="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
                <h2
                    class="text-2xl font-bold text-[var(--color-off-black)] mb-6 text-center"
                >
                    Gala Admin Access
                </h2>
                {#if error}
                    <div
                        class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm"
                    >
                        {error}
                    </div>
                {/if}
                <form on:submit|preventDefault={handleLogin} class="space-y-4">
                    <div>
                        <label
                            for="password-input"
                            class="block text-sm font-medium text-[var(--color-medium-gray)] mb-1"
                            >Password</label
                        >
                        <input
                            id="password-input"
                            type="password"
                            bind:value={passwordInput}
                            class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-[var(--color-vibrant-pink)] focus:border-transparent outline-none"
                            placeholder="Enter admin password"
                        />
                    </div>
                    <button
                        type="submit"
                        class="w-full bg-[var(--color-vibrant-pink)] text-white font-bold py-2 px-4 rounded-md hover:opacity-90 transition-opacity"
                    >
                        Unlock Dashboard
                    </button>
                </form>
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
