<script>
    import { onMount } from "svelte";
    import { totalRaised, progressPercentage } from "../../stores/galaStore";
    import confetti from "canvas-confetti";
    import { fade, fly } from "svelte/transition";

    let previousTotal = 0;
    let showToast = false;
    let toastMessage = "";
    let isGoalReached = false;

    const GOAL = 300000;
    const INCREMENT = 50000;

    // Subscribe to totalRaised to handle celebrations
    $: {
        if ($totalRaised > previousTotal) {
            checkCelebration($totalRaised, previousTotal);
            previousTotal = $totalRaised;
        }
    }

    $: isGoalReached = $totalRaised >= GOAL;

    function checkCelebration(current, previous) {
        // Check for goal reached
        if (current >= GOAL && previous < GOAL) {
            triggerGoalCelebration();
            return;
        }

        // Check for 50k increments
        const currentLevel = Math.floor(current / INCREMENT);
        const previousLevel = Math.floor(previous / INCREMENT);

        if (currentLevel > previousLevel && current < GOAL) {
            triggerIncrementCelebration(currentLevel * INCREMENT);
        }
    }

    function triggerIncrementCelebration(amount) {
        toastMessage = `We hit $${amount.toLocaleString()}! Keep the momentum going!`;
        if (amount === 150000) {
            toastMessage = "Halfway there! Amazing work!";
        }
        showToast = true;
        setTimeout(() => {
            showToast = false;
        }, 5000);
    }

    function triggerGoalCelebration() {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ["#b5a18d", "#ffbd59", "#ffffff"],
        });

        // Continuous confetti for a few seconds
        const duration = 3000;
        const end = Date.now() + duration;

        (function frame() {
            confetti({
                particleCount: 5,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ["#b5a18d", "#ffbd59", "#ffffff"],
            });
            confetti({
                particleCount: 5,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ["#b5a18d", "#ffbd59", "#ffffff"],
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        })();
    }

    // Format currency
    const formatCurrency = (value) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
        }).format(value);
    };
</script>

<div class="w-full max-w-full mx-auto relative">
    <!-- Toast Notification -->
    {#if showToast}
        <div
            transition:fly={{ y: 20, duration: 500 }}
            class="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-off-black text-accent-gold px-12 py-6 rounded-full shadow-[0_0_50px_rgba(0,0,0,0.8)] z-[9999] font-bold text-4xl whitespace-nowrap border-4 border-accent-gold"
        >
            {toastMessage}
        </div>
    {/if}

    <!-- Main Container -->
    <div
        class="w-full h-16 bg-gray-900 rounded-full border border-gray-700 shadow-inner overflow-hidden relative"
    >
        <!-- Fill -->
        <div
            class="h-full w-full transition-all duration-1000 ease-out relative"
            style="clip-path: inset(0 {100 - ($progressPercentage || 0)}% 0 0);"
            class:bg-gradient-to-r={!isGoalReached}
            class:from-vibrant-pink={!isGoalReached}
            class:to-accent-gold={!isGoalReached}
            class:bg-accent-gold={isGoalReached}
            class:shadow-[0_0_30px_rgba(255,189,89,0.5)]={isGoalReached}
        >
            <!-- Shimmer Effect -->
            {#if !isGoalReached}
                <div
                    class="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 animate-shimmer"
                ></div>
            {/if}
        </div>

        <!-- Text Overlay (Centered) -->
        <div
            class="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
        >
            <h2
                class="text-5xl font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tracking-wider"
            >
                {formatCurrency($totalRaised)}
            </h2>
        </div>

        <!-- Goal Marker -->
        <div
            class="absolute right-6 top-1/2 transform -translate-y-1/2 text-gray-400 font-bold z-10 text-xl"
        >
            {isGoalReached ? "GOAL REACHED!" : "$300k Goal"}
        </div>
    </div>
</div>

<style>
    /* Custom shimmer animation */
    @keyframes shimmer {
        0% {
            transform: translateX(-100%) skewX(-12deg);
        }
        100% {
            transform: translateX(200%) skewX(-12deg);
        }
    }

    .animate-shimmer {
        animation: shimmer 2.5s infinite linear;
    }
</style>
