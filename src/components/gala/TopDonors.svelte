<script>
    import { topDonors } from "../../stores/galaStore";
    import { flip } from "svelte/animate";
    import { fade } from "svelte/transition";

    // Format currency
    const formatCurrency = (value) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
        }).format(value);
    };

    // Helper for rank styling
    function getRankStyle(index) {
        if (index === 0)
            return "border-accent-gold bg-white/10 shadow-[0_0_30px_rgba(255,189,89,0.3)] scale-105 z-10"; // Gold
        return "border-white/20 bg-white/5 hover:bg-white/10"; // Standard
    }

    function getRankLabel(index) {
        if (index === 0) return "🥇 Top Donor";
        return `#${index + 1}`;
    }
</script>

<div class="w-full h-full p-4">
    <h3
        class="text-3xl font-bold text-white mb-8 text-left border-b border-white/10 pb-4 uppercase tracking-widest"
    >
        Leaderboard
    </h3>

    {#if $topDonors.length === 0}
        <div class="text-center text-gray-400 italic py-8 text-xl">
            Waiting for donations...
        </div>
    {:else}
        <!-- Grid Layout for All Cards -->
        <div class="grid grid-cols-1 gap-6">
            {#each $topDonors.slice(0, 5) as donor, index (donor.paddleNumber || donor.name)}
                <div
                    animate:flip={{ duration: 500 }}
                    transition:fade
                    class="relative p-3 rounded-xl border backdrop-blur-md flex items-center justify-between transition-all duration-500 shadow-lg mx-4 {getRankStyle(
                        index,
                    )}"
                >
                    <div class="flex items-center gap-6">
                        <div
                            class="text-lg font-bold uppercase tracking-widest opacity-80 text-gray-400 min-w-[2rem] text-center whitespace-nowrap"
                        >
                            {getRankLabel(index)}
                        </div>
                        <div
                            class="text-xl md:text-2xl font-bold text-accent-gold truncate"
                        >
                            {donor.name}
                        </div>
                    </div>
                    <div class="text-xl md:text-3xl font-bold text-white">
                        {formatCurrency(donor.amount)}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>
