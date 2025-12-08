<script>
    import { recentDonations } from "../../stores/galaStore";

    // Format currency
    const formatCurrency = (value) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
        }).format(value);
    };

    // Track newest donation for glow effect
    $: newestId = $recentDonations.length > 0 ? $recentDonations[0].id : null;
</script>

<div class="w-full h-full flex items-center overflow-hidden relative group">
    <!-- Gradient masks for smooth fade edges -->
    <div
        class="absolute left-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-r from-gray-900 to-transparent z-10"
    ></div>
    <div
        class="absolute right-0 top-0 bottom-0 w-16 md:w-32 bg-gradient-to-l from-gray-900 to-transparent z-10"
    ></div>

    {#if $recentDonations.length > 0}
        <div
            class="flex whitespace-nowrap animate-marquee hover:pause items-center"
        >
            <!-- Duplicate content to ensure seamless loop -->
            {#each Array(4) as _, loopIndex}
                <div class="flex items-center">
                    {#each $recentDonations as donation, donationIndex (donation.id || donation.timestamp)}
                        <div
                            class="mx-6 md:mx-12 flex items-center text-lg md:text-2xl text-white transition-all duration-500
                                   {loopIndex === 0 && donationIndex === 0
                                ? 'animate-glow'
                                : ''}"
                        >
                            <!-- Donor name with subtle highlight for newest -->
                            <span
                                class="font-bold mr-2 md:mr-3
                                       {loopIndex === 0 && donationIndex === 0
                                    ? 'text-accent-gold'
                                    : 'text-white'}"
                            >
                                {donation.donorName}
                            </span>
                            <span class="text-gray-400 mr-2 md:mr-3 font-light"
                                >donated</span
                            >
                            <span
                                class="font-bold
                                       {loopIndex === 0 && donationIndex === 0
                                    ? 'text-vibrant-pink animate-pulse-glow'
                                    : 'text-accent-gold'}"
                            >
                                {formatCurrency(donation.amount)}
                            </span>
                            <span
                                class="ml-6 md:ml-12 text-accent-gold/30 text-xl"
                                >•</span
                            >
                        </div>
                    {/each}
                </div>
            {/each}
        </div>
    {:else}
        <div class="w-full text-center text-gray-500 italic text-lg md:text-xl">
            Waiting for first donation...
        </div>
    {/if}
</div>

<style>
    @keyframes marquee {
        0% {
            transform: translateX(0);
        }
        100% {
            transform: translateX(-50%);
        }
    }

    .animate-marquee {
        animation: marquee 56s linear infinite;
    }

    /* Pause animation on hover for readability */
    .group:hover .animate-marquee {
        animation-play-state: paused;
    }

    /* Glow effect for newest donation */
    @keyframes glow {
        0%,
        100% {
            text-shadow:
                0 0 10px rgba(255, 189, 89, 0.5),
                0 0 20px rgba(255, 189, 89, 0.3);
        }
        50% {
            text-shadow:
                0 0 20px rgba(255, 189, 89, 0.8),
                0 0 40px rgba(255, 189, 89, 0.5);
        }
    }

    .animate-glow {
        animation: glow 2s ease-in-out infinite;
    }

    /* Pulsing glow for amount */
    @keyframes pulse-glow {
        0%,
        100% {
            text-shadow: 0 0 10px rgba(181, 161, 141, 0.5);
        }
        50% {
            text-shadow:
                0 0 25px rgba(181, 161, 141, 0.9),
                0 0 50px rgba(255, 189, 89, 0.5);
        }
    }

    .animate-pulse-glow {
        animation: pulse-glow 1.5s ease-in-out infinite;
    }

    /* Utility for tailwind if not already present */
    :global(.hover\:pause:hover) {
        animation-play-state: paused;
    }
</style>
