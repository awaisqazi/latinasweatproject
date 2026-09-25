<script>
  // fx=off. The hero with no WebGL at all: an inline SVG of the X mark whose
  // fill rises by clip rect, a ghost outline underneath so the mark is always a
  // promise, and the core dot only at 100% (never isolate the core).
  //
  // This is also what phones and prefers-reduced-motion get, and where the page
  // lands after repeated context loss (05 section 5.8).

  let { progress = 0, goalMet = false, reduced = false } = $props();

  const p = $derived(Math.max(0, Math.min(1, Number(progress) || 0)));
  // Local space runs y from -0.95 (bottom) to 0.95 (top) inside the viewBox.
  const fillTop = $derived(0.95 - 1.9 * p);
  const fillHeight = $derived(1.9 * p);
  const angle = 40.107; // 0.7 rad, the same bar angle as the shader's sdX
</script>

<div class="wrap" class:met={goalMet} class:still={reduced}>
  <div class="halo" aria-hidden="true"></div>
  <svg viewBox="-1.25 -1.25 2.5 2.5" role="img" aria-label="Progress toward tonight's goal">
    <defs>
      <clipPath id="g26-band">
        <rect x="-1" y="-0.86" width="2" height="1.72" />
      </clipPath>
      <mask id="g26-xmask">
        <rect x="-1.25" y="-1.25" width="2.5" height="2.5" fill="black" />
        <g clip-path="url(#g26-band)" fill="white">
          <rect x="-0.23" y="-1.5" width="0.46" height="3" transform={`rotate(${angle})`} />
          <rect x="-0.23" y="-1.5" width="0.46" height="3" transform={`rotate(${-angle})`} />
        </g>
        <circle cx="-0.4" cy="0" r="0.21" fill="white" />
        <circle cx="0.4" cy="0" r="0.21" fill="white" />
        <circle cx="0" cy="0" r="0.25" fill="black" />
      </mask>
      <linearGradient id="g26-molten" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="#b9842f" />
        <stop offset="55%" stop-color="#ffbd59" />
        <stop offset="100%" stop-color="#fff1be" />
      </linearGradient>
      <!-- Erode the silhouette and subtract it: what is left is the ghost
           outline, including the ring around the mark's centre hole. -->
      <filter id="g26-outline" x="-20%" y="-20%" width="140%" height="140%">
        <feMorphology operator="erode" radius="0.014" result="inner" />
        <feComposite in="SourceGraphic" in2="inner" operator="out" />
      </filter>
    </defs>

    <g mask="url(#g26-xmask)">
      <rect class="body" x="-1.25" y="-1.25" width="2.5" height="2.5" />
      <rect class="fill" x="-1.25" y={fillTop} width="2.5" height={fillHeight} fill="url(#g26-molten)" />
      <rect class="meniscus" x="-1.25" y={fillTop - 0.012} width="2.5" height={p > 0.002 ? 0.024 : 0} />
    </g>
    <g filter="url(#g26-outline)">
      <g mask="url(#g26-xmask)">
        <rect class="ghost" x="-1.25" y="-1.25" width="2.5" height="2.5" />
      </g>
    </g>
    {#if goalMet}
      <circle class="core" cx="0" cy="0" r="0.1" />
    {/if}
  </svg>
</div>

<style>
  .wrap {
    position: absolute;
    inset: 0;
  }
  /* Absolute, not a grid item: a percentage height on a centred grid item is a
     cyclic size, and the browser falls back to the 1:1 intrinsic ratio. */
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .halo {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 130%;
    height: 130%;
    transform: translate(-50%, -50%);
    background: radial-gradient(closest-side, rgba(255, 244, 199, 0.3) 0%, rgba(255, 189, 89, 0.11) 38%, transparent 100%);
    pointer-events: none;
  }
  .met .halo {
    background: radial-gradient(closest-side, rgba(255, 244, 199, 0.46) 0%, rgba(255, 189, 89, 0.18) 40%, transparent 100%);
  }
  /* The faint body: the mark is always a promise, never a solid slab. */
  .body {
    fill: #ffbd59;
    opacity: 0.07;
  }
  .ghost {
    fill: #ffbd59;
    opacity: 0.62;
  }
  .met .ghost {
    opacity: 0.9;
  }
  .fill {
    transition: y 1.2s cubic-bezier(0.25, 0.8, 0.25, 1), height 1.2s cubic-bezier(0.25, 0.8, 0.25, 1);
    filter: drop-shadow(0 0 0.06px rgba(255, 189, 89, 0.9));
  }
  .meniscus {
    fill: #fff8ef;
    opacity: 0.85;
    transition: y 1.2s cubic-bezier(0.25, 0.8, 0.25, 1);
  }
  .core {
    fill: #fff1be;
    filter: drop-shadow(0 0 0.08px #ffbd59);
  }
  .still .fill,
  .still .meniscus {
    transition: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .fill,
    .meniscus {
      transition: none;
    }
  }
</style>
