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
</script>

<div class="w-full h-full flex items-center overflow-hidden relative group">
    <!-- Gradient masks for smooth fade edges -->
    <div
        class="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-gray-900 to-transparent z-10"
    ></div>
    <div
        class="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-gray-900 to-transparent z-10"
    ></div>

    {#if $recentDonations.length > 0}
        <div
            class="flex whitespace-nowrap animate-marquee hover:pause items-center"
        >
            <!-- Duplicate content to ensure seamless loop -->
            {#each Array(4) as _}
                <div class="flex items-center">
                    {#each $recentDonations as donation (donation.id || donation.timestamp)}
                        <div
                            class="mx-12 flex items-center text-2xl text-white"
                        >
                            <span class="font-bold mr-3"
                                >{donation.donorName}</span
                            >
                            <span class="text-gray-400 mr-3 font-light"
                                >donated</span
                            >
                            <span class="font-bold text-accent-gold"
                                >{formatCurrency(donation.amount)}</span
                            >
                            <span class="ml-12 text-accent-gold/30 text-xl"
                                >•</span
                            >
                        </div>
                    {/each}
                </div>
            {/each}
        </div>
    {:else}
        <div class="w-full text-center text-gray-500 italic text-xl">
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
        animation: marquee 40s linear infinite;
    }

    /* Pause animation on hover for readability */
    .group:hover .animate-marquee {
        animation-play-state: paused;
    }

    /* Utility for tailwind if not already present, though we used inline style block for specific keyframes */
    :global(.hover\:pause:hover) {
        animation-play-state: paused;
    }
</style>
