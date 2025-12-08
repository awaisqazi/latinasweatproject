<script>
    import { topDonors } from "../../stores/galaStore";
    import { flip } from "svelte/animate";

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
            return "border-accent-gold bg-gradient-to-r from-accent-gold/20 to-transparent shadow-[0_0_40px_rgba(255,189,89,0.4)] scale-105 z-10"; // Gold - Top Donor
        if (index === 1)
            return "border-gray-300 bg-gradient-to-r from-gray-300/15 to-transparent shadow-[0_0_25px_rgba(192,192,192,0.3)]"; // Silver
        if (index === 2)
            return "border-amber-700 bg-gradient-to-r from-amber-700/15 to-transparent shadow-[0_0_20px_rgba(180,83,9,0.3)]"; // Bronze
        return "border-white/20 bg-white/5 hover:bg-white/10"; // Standard
    }

    function getRankLabel(index) {
        if (index === 0) return "👑";
        if (index === 1) return "🥈";
        if (index === 2) return "🥉";
        return `#${index + 1}`;
    }

    function getRankTextColor(index) {
        if (index === 0) return "text-accent-gold";
        if (index === 1) return "text-gray-300";
        if (index === 2) return "text-amber-600";
        return "text-gray-400";
    }
</script>

<div class="w-full h-full p-2 md:p-3 pl-3 md:pl-4 flex flex-col">
    <h3
        class="text-lg md:text-xl font-bold text-white mb-2 md:mb-3 text-left border-b border-white/10 pb-2 uppercase tracking-widest flex items-center gap-2 flex-shrink-0"
    >
        <span class="text-lg md:text-xl">🏆</span>
        Leaderboard
    </h3>

    {#if $topDonors.length === 0}
        <div class="text-center text-gray-400 italic py-8 text-lg md:text-xl">
            Waiting for donations...
        </div>
    {:else}
        <!-- Grid Layout for All Cards -->
        <div class="flex flex-col gap-2 md:gap-2 flex-1 justify-evenly">
            {#each $topDonors.slice(0, 5) as donor, index (donor.paddleNumber || donor.name)}
                <div
                    animate:flip={{ duration: 300 }}
                    class="relative py-2 px-3 md:py-2 md:px-4 rounded-xl border backdrop-blur-md flex items-center justify-between transition-all duration-300 shadow-lg {getRankStyle(
                        index,
                    )}"
                >
                    <!-- Animated glow for top donor -->
                    {#if index === 0}
                        <div
                            class="absolute inset-0 rounded-xl bg-accent-gold/10 animate-pulse-slow -z-10"
                        ></div>
                    {/if}

                    <div class="flex items-center gap-3 md:gap-6">
                        <!-- Rank Badge -->
                        <div
                            class="text-xl md:text-2xl font-bold min-w-[2rem] md:min-w-[3rem] text-center
                                   {index < 3 ? 'animate-bounce-subtle' : ''}"
                        >
                            {getRankLabel(index)}
                        </div>

                        <!-- Donor Name -->
                        <div
                            class="text-lg md:text-2xl font-bold truncate max-w-[150px] md:max-w-none
                                   {getRankTextColor(index)}"
                        >
                            {donor.name}
                        </div>
                    </div>

                    <!-- Amount -->
                    <div
                        class="text-lg md:text-3xl font-bold text-white
                               {index === 0 ? 'animate-glow-text' : ''}"
                    >
                        {formatCurrency(donor.amount)}
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    /* Subtle bounce for medals */
    @keyframes bounce-subtle {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-3px);
        }
    }

    .animate-bounce-subtle {
        animation: bounce-subtle 2s ease-in-out infinite;
    }

    /* Slow pulse for top donor card */
    @keyframes pulse-slow {
        0%,
        100% {
            opacity: 0.3;
        }
        50% {
            opacity: 0.6;
        }
    }

    .animate-pulse-slow {
        animation: pulse-slow 3s ease-in-out infinite;
    }

    /* Text glow for top donor amount */
    @keyframes glow-text {
        0%,
        100% {
            text-shadow:
                0 0 10px rgba(255, 189, 89, 0.5),
                0 0 20px rgba(255, 189, 89, 0.3);
        }
        50% {
            text-shadow:
                0 0 20px rgba(255, 189, 89, 0.8),
                0 0 40px rgba(255, 189, 89, 0.5),
                0 0 60px rgba(255, 189, 89, 0.3);
        }
    }

    .animate-glow-text {
        animation: glow-text 2s ease-in-out infinite;
    }
</style>
