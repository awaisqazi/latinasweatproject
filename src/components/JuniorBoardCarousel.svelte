<script context="module">
    import { fade } from "svelte/transition";
</script>

<script>
    export let baseUrl = "/";

    const juniorBoard = [
        {
            role: "President",
            name: "Yari Jurado",
            image: "yari.png",
            bio: `Yari is a wellness leader, yoga instructor and proud mamá who has been part of Latina Sweat Project for three years. She leads with vulnerability, connection and corazón, creating spaces where everyone feels seen, supported and welcomed.`,
        },
        {
            role: "Vice President",
            name: "Yesi Preyet",
            image: "yesi.png",
            bio: `Yesi is a loving mom of an 8 year old and a future yoga teacher at LSP, excited to share the gift of yoga to our communities and help guide others on their wellness journeys.`,
        },
        {
            role: "Treasurer",
            name: "Noé Villagomez",
            image: "noe.png",
            bio: `Noe is an operations and community-focused leader with more than twenty years of experience supporting equity-driven programs across Chicago.`,
        },
        {
            role: "Secretary",
            name: "Alejandra Garcia",
            image: "alejandrag.png",
            bio: `"I am Organized, Driven, and Powered by our People." Alejandra is a south-sider from Chicago with big dreams, dedicated to representation and possibility.`,
        },
    ];

    let expandedIndex = -1;
    let touchStartX = 0;
    let touchDeltaX = 0;
    let scrollContainer;
    let isDragging = false;

    function toggleExpand(index) {
        if (expandedIndex === index) {
            expandedIndex = -1;
        } else {
            expandedIndex = index;
        }
    }

    function handleTouchStart(e) {
        touchStartX = e.touches ? e.touches[0].clientX : e.clientX;
        isDragging = true;
    }

    function handleTouchMove(e) {
        if (!isDragging) return;
        const currentX = e.touches ? e.touches[0].clientX : e.clientX;
        touchDeltaX = currentX - touchStartX;
    }

    function handleTouchEnd() {
        isDragging = false;
        touchDeltaX = 0;
    }
</script>

<div class="carousel-wrapper">
    <!-- Header -->
    <div class="carousel-header">
        <span class="carousel-icon">👑</span>
        <span class="carousel-title">Your 2025 Junior Board</span>
    </div>

    <!-- Scroll Container -->
    <div
        class="scroll-container"
        bind:this={scrollContainer}
        on:touchstart={handleTouchStart}
        on:touchmove={handleTouchMove}
        on:touchend={handleTouchEnd}
        on:mousedown={handleTouchStart}
        on:mousemove={handleTouchMove}
        on:mouseup={handleTouchEnd}
        on:mouseleave={handleTouchEnd}
        role="group"
        aria-label="Junior Board member cards"
    >
        {#each juniorBoard as member, index}
            <button
                class="card"
                class:expanded={expandedIndex === index}
                class:collapsed={expandedIndex !== -1 &&
                    expandedIndex !== index}
                on:click={() => toggleExpand(index)}
                type="button"
                aria-label={`${member.name}, ${member.role}`}
                aria-expanded={expandedIndex === index}
            >
                <!-- Background Image -->
                <div class="card-image">
                    <img
                        src={`${baseUrl}images/election/${member.image}`}
                        alt={member.name}
                        loading="lazy"
                    />
                    <div class="image-gradient"></div>
                </div>

                <!-- Content Overlay -->
                <div class="card-content">
                    <div class="role-badge">{member.role}</div>
                    <h3 class="member-name">{member.name}</h3>

                    {#if expandedIndex === index}
                        <p
                            class="member-bio"
                            in:fade={{ duration: 300, delay: 100 }}
                        >
                            {member.bio}
                        </p>
                        <span class="tap-hint">Tap to close</span>
                    {:else}
                        <span class="tap-hint">Tap to read bio</span>
                    {/if}
                </div>

                <!-- Shine Effect -->
                <div class="shine"></div>
            </button>
        {/each}
    </div>

    <!-- Progress Indicator -->
    <div class="progress-dots">
        {#each juniorBoard as _, index}
            <span class="dot" class:active={expandedIndex === index}></span>
        {/each}
    </div>

    <!-- Swipe Hint -->
    <p class="swipe-instruction">
        <svg
            class="swipe-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
        >
            <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
        Swipe to explore • Tap to expand
    </p>
</div>

<style>
    .carousel-wrapper {
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        padding: 1rem 0;
    }

    .carousel-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        margin-bottom: 1.25rem;
        padding: 0 1rem;
    }

    .carousel-icon {
        font-size: 1.75rem;
        animation: float 3s ease-in-out infinite;
    }

    @keyframes float {
        0%,
        100% {
            transform: translateY(0);
        }
        50% {
            transform: translateY(-4px);
        }
    }

    .carousel-title {
        font-size: 1.125rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.9);
    }

    .scroll-container {
        display: flex;
        gap: 12px;
        padding: 0.5rem 1rem 1rem;
        overflow-x: auto;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        cursor: grab;
    }

    .scroll-container::-webkit-scrollbar {
        display: none;
    }

    .scroll-container:active {
        cursor: grabbing;
    }

    .card {
        flex-shrink: 0;
        width: 160px;
        height: 220px;
        border-radius: 24px;
        position: relative;
        overflow: hidden;
        scroll-snap-align: start;
        transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        transform-origin: center center;
        border: none;
        padding: 0;
        background: transparent;
        cursor: pointer;
        box-shadow:
            0 4px 20px rgba(0, 0, 0, 0.3),
            0 0 0 1px rgba(255, 255, 255, 0.1);
    }

    .card:hover {
        transform: translateY(-4px) scale(1.02);
        box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(212, 175, 55, 0.3);
    }

    .card.expanded {
        width: 300px;
        height: 380px;
        box-shadow:
            0 16px 48px rgba(0, 0, 0, 0.5),
            0 0 0 2px rgba(212, 175, 55, 0.5),
            0 0 60px rgba(212, 175, 55, 0.2);
        z-index: 10;
    }

    .card.collapsed {
        width: 80px;
        opacity: 0.6;
        filter: brightness(0.7);
    }

    .card-image {
        position: absolute;
        inset: 0;
    }

    .card-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        object-position: center top;
        transition: transform 0.5s ease;
    }

    .card:hover .card-image img {
        transform: scale(1.05);
    }

    .card.expanded .card-image img {
        transform: scale(1.1);
    }

    .image-gradient {
        position: absolute;
        inset: 0;
        background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.95) 0%,
            rgba(0, 0, 0, 0.7) 40%,
            rgba(0, 0, 0, 0.2) 70%,
            transparent 100%
        );
        transition: opacity 0.3s ease;
    }

    .card.expanded .image-gradient {
        background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.98) 0%,
            rgba(0, 0, 0, 0.85) 50%,
            rgba(0, 0, 0, 0.4) 80%,
            transparent 100%
        );
    }

    .card-content {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.25rem;
        transition: all 0.4s ease;
    }

    .card.expanded .card-content {
        padding: 1.5rem;
        gap: 0.5rem;
    }

    .role-badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        background: linear-gradient(135deg, #d4af37, #b8962f);
        border-radius: 100px;
        font-size: 0.625rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #1a1a1a;
        box-shadow: 0 2px 8px rgba(212, 175, 55, 0.4);
        transition: all 0.3s ease;
    }

    .card.expanded .role-badge {
        font-size: 0.75rem;
        padding: 0.35rem 1rem;
    }

    .card.collapsed .role-badge {
        display: none;
    }

    .member-name {
        font-size: 1rem;
        font-weight: 800;
        color: white;
        margin: 0;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
        transition: font-size 0.3s ease;
        line-height: 1.2;
    }

    .card.expanded .member-name {
        font-size: 1.5rem;
    }

    .card.collapsed .member-name {
        font-size: 0.75rem;
        writing-mode: vertical-rl;
        text-orientation: mixed;
        transform: rotate(180deg);
        position: absolute;
        bottom: 1rem;
        left: 50%;
        transform: translateX(-50%) rotate(180deg);
        white-space: nowrap;
    }

    .member-bio {
        font-size: 0.875rem;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.9);
        margin: 0.5rem 0 0;
        max-height: 150px;
        overflow-y: auto;
        padding-right: 0.5rem;
    }

    .member-bio::-webkit-scrollbar {
        width: 3px;
    }

    .member-bio::-webkit-scrollbar-thumb {
        background: rgba(212, 175, 55, 0.5);
        border-radius: 3px;
    }

    .tap-hint {
        font-size: 0.625rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: rgba(255, 255, 255, 0.5);
        margin-top: 0.5rem;
        transition: opacity 0.3s ease;
    }

    .card.collapsed .tap-hint {
        display: none;
    }

    .shine {
        position: absolute;
        inset: 0;
        background: linear-gradient(
            120deg,
            transparent 0%,
            transparent 40%,
            rgba(255, 255, 255, 0.1) 45%,
            rgba(255, 255, 255, 0.2) 50%,
            rgba(255, 255, 255, 0.1) 55%,
            transparent 60%,
            transparent 100%
        );
        transform: translateX(-100%);
        transition: transform 0.8s ease;
        pointer-events: none;
    }

    .card:hover .shine {
        transform: translateX(100%);
    }

    .progress-dots {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-top: 1rem;
    }

    .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.3);
        transition: all 0.3s ease;
    }

    .dot.active {
        width: 24px;
        border-radius: 4px;
        background: linear-gradient(90deg, #d4af37, #e6007e);
    }

    .swipe-instruction {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        margin-top: 1rem;
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.5);
        text-align: center;
    }

    .swipe-icon {
        width: 16px;
        height: 16px;
        animation: swipe-hint 2s ease-in-out infinite;
    }

    @keyframes swipe-hint {
        0%,
        100% {
            transform: translateX(0);
            opacity: 0.5;
        }
        50% {
            transform: translateX(4px);
            opacity: 1;
        }
    }

    /* Desktop: Show all cards in view */
    @media (min-width: 768px) {
        .scroll-container {
            justify-content: center;
            gap: 16px;
            padding: 1rem 2rem;
        }

        .card {
            width: 180px;
            height: 260px;
        }

        .card.expanded {
            width: 340px;
            height: 420px;
        }

        .card.collapsed {
            width: 100px;
        }

        .swipe-instruction {
            display: none;
        }
    }

    /* Large screens */
    @media (min-width: 1024px) {
        .card {
            width: 200px;
            height: 280px;
        }

        .card.expanded {
            width: 380px;
            height: 450px;
        }

        .card.collapsed {
            width: 120px;
        }
    }
</style>
