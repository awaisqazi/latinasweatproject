<script>
    import { onMount } from "svelte";
    import { donations } from "../../stores/galaStore";
    import { fly, scale } from "svelte/transition";
    import { quintOut, elasticOut } from "svelte/easing";
    import confetti from "canvas-confetti";

    // Track shown donation IDs to avoid duplicates
    let shownDonationIds = new Set();
    let currentPopup = null;
    let isVisible = false;
    let isInitialized = false;

    // Guest lookup for names
    import { guests } from "../../stores/galaStore";

    const formatCurrency = (value) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
        }).format(value);
    };

    // Watch for new donations
    $: {
        if ($donations && $donations.length > 0 && isInitialized) {
            const latestDonation = $donations[0];
            if (
                latestDonation &&
                latestDonation.id &&
                !shownDonationIds.has(latestDonation.id)
            ) {
                showNotification(latestDonation);
                shownDonationIds.add(latestDonation.id);
            }
        }
    }

    onMount(() => {
        // Mark all existing donations as "seen" to avoid showing popups for old ones
        if ($donations) {
            $donations.forEach((d) => {
                if (d.id) shownDonationIds.add(d.id);
            });
        }
        // Small delay to prevent flash of old donations
        setTimeout(() => {
            isInitialized = true;
        }, 1000);
    });

    function showNotification(donation) {
        // Resolve donor name
        let donorName = donation.donorName || "Anonymous";
        if (donation.paddleNumber && $guests[donation.paddleNumber]) {
            donorName = $guests[donation.paddleNumber];
        }

        currentPopup = {
            id: donation.id,
            name: donorName,
            amount: donation.amount,
            isLarge: donation.amount >= 1000,
            isHuge: donation.amount >= 5000,
        };
        isVisible = true;

        // Trigger confetti for large donations
        if (currentPopup.isLarge) {
            triggerCelebration(currentPopup.isHuge);
        }

        // Auto-dismiss after delay
        setTimeout(
            () => {
                isVisible = false;
                setTimeout(() => {
                    currentPopup = null;
                }, 600);
            },
            currentPopup.isHuge ? 5000 : 4000,
        );
    }

    function triggerCelebration(isHuge) {
        const particleCount = isHuge ? 150 : 80;
        const spread = isHuge ? 100 : 70;

        confetti({
            particleCount,
            spread,
            origin: { y: 0.8, x: 0.5 },
            colors: ["#b5a18d", "#ffbd59", "#ffffff", "#ff69b4"],
            gravity: 0.8,
        });

        if (isHuge) {
            // Extra celebration burst
            setTimeout(() => {
                confetti({
                    particleCount: 50,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0.2, y: 0.8 },
                    colors: ["#b5a18d", "#ffbd59"],
                });
                confetti({
                    particleCount: 50,
                    angle: 120,
                    spread: 55,
                    origin: { x: 0.8, y: 0.8 },
                    colors: ["#b5a18d", "#ffbd59"],
                });
            }, 300);
        }
    }
</script>

<!-- Popup Notification -->
{#if isVisible && currentPopup}
    <div
        class="fixed left-1/2 transform -translate-x-1/2 z-50 pointer-events-none
               bottom-[12vh] md:bottom-[14vh]"
        in:fly={{ y: 100, duration: 600, easing: elasticOut }}
        out:fly={{ y: 50, duration: 400, easing: quintOut }}
    >
        <div
            class="relative px-6 py-4 md:px-10 md:py-6 rounded-2xl shadow-2xl
                   backdrop-blur-xl border
                   {currentPopup.isHuge
                ? 'bg-gradient-to-r from-accent-gold/90 to-vibrant-pink/90 border-white/40'
                : currentPopup.isLarge
                  ? 'bg-gradient-to-r from-vibrant-pink/80 to-accent-gold/80 border-accent-gold/50'
                  : 'bg-gray-900/90 border-white/20'}"
            in:scale={{ duration: 300, delay: 100, start: 0.8 }}
        >
            <!-- Glow Effect -->
            <div
                class="absolute inset-0 rounded-2xl blur-xl opacity-50 -z-10
                       {currentPopup.isHuge
                    ? 'bg-accent-gold'
                    : currentPopup.isLarge
                      ? 'bg-vibrant-pink'
                      : 'bg-gray-700'}"
            ></div>

            <!-- Content -->
            <div class="text-center">
                <p
                    class="text-sm md:text-base uppercase tracking-widest mb-1 md:mb-2
                          {currentPopup.isHuge || currentPopup.isLarge
                        ? 'text-white/80'
                        : 'text-gray-400'}"
                >
                    {currentPopup.isHuge
                        ? "🎉 INCREDIBLE GIFT! 🎉"
                        : currentPopup.isLarge
                          ? "✨ GENEROUS DONOR ✨"
                          : "New Donation"}
                </p>
                <p
                    class="text-xl md:text-3xl font-bold mb-1 md:mb-2
                          {currentPopup.isHuge || currentPopup.isLarge
                        ? 'text-white'
                        : 'text-accent-gold'}"
                >
                    {currentPopup.name}
                </p>
                <p
                    class="text-3xl md:text-5xl font-bold
                          {currentPopup.isHuge
                        ? 'text-white animate-pulse'
                        : currentPopup.isLarge
                          ? 'text-white'
                          : 'text-white'}"
                >
                    {formatCurrency(currentPopup.amount)}
                </p>
            </div>

            <!-- Sparkle decorations for large donations -->
            {#if currentPopup.isLarge}
                <div class="absolute -top-2 -left-2 text-2xl animate-bounce">
                    ✨
                </div>
                <div
                    class="absolute -top-2 -right-2 text-2xl animate-bounce"
                    style="animation-delay: 0.2s"
                >
                    ✨
                </div>
                <div
                    class="absolute -bottom-2 -left-2 text-2xl animate-bounce"
                    style="animation-delay: 0.4s"
                >
                    ✨
                </div>
                <div
                    class="absolute -bottom-2 -right-2 text-2xl animate-bounce"
                    style="animation-delay: 0.6s"
                >
                    ✨
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    @keyframes shimmer {
        0% {
            opacity: 0.5;
        }
        50% {
            opacity: 1;
        }
        100% {
            opacity: 0.5;
        }
    }
</style>
