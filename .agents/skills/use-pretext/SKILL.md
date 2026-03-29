---
name: use-pretext
description: Evaluate whether @chenglou/pretext is useful for a given UI element, and if so, implement it using the correct pretext APIs. Use this skill when the user asks you to create or modify a component where text layout, measurement, or rendering is involved.
---

# Pretext Skill — DOM-Free Text Measurement & Layout

## When This Skill Applies

Invoke this skill whenever the user asks you to create or modify a UI element and **any** of the following conditions are true:

### ✅ USE pretext when:
1. **Virtualized / occlusion-culled lists** — You need to know the pixel height of variable-text items *before* rendering them (e.g. admin tables, volunteer logs, chat-like feeds).
2. **Masonry or column-balanced layouts** — You need to place text cards into columns and must know each card's height upfront to balance columns.
3. **Canvas / SVG text rendering** — You need to draw multiline wrapped text onto `<canvas>` or `<svg>` (e.g. generating downloadable flyers, social media images, badges).
4. **Shrink-wrap / tight-fit containers** — You want a container's width to tightly wrap around the widest rendered line of text (chat bubbles, tooltips, badges).
5. **Preventing layout shift** — New text loads dynamically and you need to reserve the exact space before it renders to prevent CLS (Cumulative Layout Shift).
6. **Text truncation with exact line control** — You need to know exactly where line N ends to insert "Read more…" or an ellipsis at the precise character boundary.
7. **Responsive text-aware layouts** — The layout of surrounding elements depends on how many lines text will occupy at a given container width.
8. **Performance-critical resize handlers** — You need to recalculate text dimensions on every resize frame without triggering DOM reflows.

### ❌ DO NOT use pretext when:
1. **Static rendered text** — The text is rendered by Astro at build time and never needs JS measurement (most `.astro` pages).
2. **CSS can handle it** — `line-clamp`, `text-overflow: ellipsis`, `min-height`, or CSS Grid/Flexbox already solve the layout need.
3. **Server-side only** — pretext requires a browser environment with `<canvas>` and `Intl.Segmenter`. It does not run in Node.js / SSR.
4. **Single-line text** — For single-line text, `canvas.measureText()` is simpler and sufficient.

---

## Project-Specific Context

This project uses:
- **Framework**: Astro + Svelte (interactive islands via `client:load` / `client:visible`)
- **Styling**: Tailwind CSS v4
- **Font**: `Rubik` (loaded from Google Fonts: `400` and `700` weights)
- **Font CSS shorthand for pretext**: `'16px Rubik'` or `'bold 16px Rubik'` — must match CSS declarations exactly
- **Key colors**: `vibrant-pink: #b5a18d`, `accent-gold: #ffbd59`, `off-black: #1E1E1E`

> **CRITICAL**: Never use `system-ui` as the font argument to pretext on macOS — it causes measurement inaccuracies. Always use the named font family `Rubik`.

---

## API Reference

All imports come from `@chenglou/pretext`:

```ts
import {
  prepare,
  prepareWithSegments,
  layout,
  layoutWithLines,
  layoutNextLine,
  walkLineRanges,
  clearCache,
  setLocale,
} from '@chenglou/pretext'
```

### Use-Case 1: Measure Height Without DOM (the fast path)

```ts
// prepare() — one-time text analysis + segment measurement via canvas.
// Call once when text first appears. Result is width-independent.
prepare(
  text: string,
  font: string,                             // e.g. '16px Rubik' — must match your CSS font shorthand
  options?: { whiteSpace?: 'normal' | 'pre-wrap' }
): PreparedText

// layout() — pure arithmetic, no DOM. ~0.0002ms per call.
// Call on every resize, width change, etc.
layout(
  prepared: PreparedText,
  maxWidth: number,                          // container width in px
  lineHeight: number                         // must match your CSS line-height in px
): { height: number, lineCount: number }
```

### Use-Case 2: Get Individual Lines (for canvas/SVG/custom rendering)

```ts
// prepareWithSegments() — like prepare() but returns richer data for line-level access
prepareWithSegments(
  text: string,
  font: string,
  options?: { whiteSpace?: 'normal' | 'pre-wrap' }
): PreparedTextWithSegments

// layoutWithLines() — returns all lines at a fixed max width
layoutWithLines(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  lineHeight: number
): {
  height: number,
  lineCount: number,
  lines: LayoutLine[]    // each line has: { text, width, start, end }
}

// walkLineRanges() — callback per line, no string allocation. Great for shrink-wrap.
walkLineRanges(
  prepared: PreparedTextWithSegments,
  maxWidth: number,
  onLine: (line: LayoutLineRange) => void   // { width, start, end }
): number   // returns line count

// layoutNextLine() — iterate one line at a time with varying widths
layoutNextLine(
  prepared: PreparedTextWithSegments,
  start: LayoutCursor,                      // { segmentIndex, graphemeIndex }
  maxWidth: number
): LayoutLine | null
```

### Helpers

```ts
clearCache(): void      // Release internal measurement caches (e.g. when switching fonts)
setLocale(locale?: string): void   // Change locale for future prepare() calls; also clears cache
```

### Types

```ts
type LayoutLine = {
  text: string           // 'hello world'
  width: number          // 87.5 (px)
  start: LayoutCursor
  end: LayoutCursor
}

type LayoutLineRange = {
  width: number
  start: LayoutCursor
  end: LayoutCursor
}

type LayoutCursor = {
  segmentIndex: number
  graphemeIndex: number
}
```

---

## Important Caveats

1. **Font string must match CSS** — The `font` parameter uses the same format as `CanvasRenderingContext2D.font`. Example: `'bold 16px Rubik'`. It must match your actual CSS `font-size`, `font-weight`, `font-style`, and `font-family`.
2. **`system-ui` is unsafe** on macOS — canvas resolves it to a different optical variant than the DOM. Always use the named font (`Rubik` in this project).
3. **CSS assumptions** — pretext assumes `white-space: normal`, `word-break: normal`, `overflow-wrap: break-word`, `line-break: auto`. These are the browser defaults, so they apply unless you override them.
4. **`pre-wrap` mode** — Pass `{ whiteSpace: 'pre-wrap' }` if you need to preserve spaces, `\t` tabs, and `\n` newlines (textarea-like behavior).
5. **Browser-only** — pretext uses `<canvas>` and `Intl.Segmenter`. It must run in `client:load` or `client:visible` Svelte components, NOT in Astro frontmatter or SSR.
6. **Wait for fonts** — If font loading might be delayed, wrap your initial `prepare()` call inside `document.fonts.ready.then(() => { ... })` to ensure accurate measurements.

---

## Code Recipes

### Recipe 1: Masonry Layout (Svelte)

Use when you need a Pinterest-style grid of text cards with variable heights.

```svelte
<script>
  import { onMount } from 'svelte'
  import { prepare, layout } from '@chenglou/pretext'

  export let items = [] // Array of { text: string, ... }

  const font = '16px Rubik'
  const lineHeight = 24         // matches your CSS line-height
  const cardPadding = 32        // total vertical padding (top + bottom)
  const gap = 16
  const colCount = 3

  let containerWidth = 0
  let positioned = []
  let containerEl

  function computeLayout(width) {
    const colWidth = (width - (colCount - 1) * gap) / colCount
    const textWidth = colWidth - 32 // horizontal padding
    const colHeights = new Array(colCount).fill(0)
    const result = []

    for (const item of items) {
      const prepared = prepare(item.text, font)
      const { height } = layout(prepared, textWidth, lineHeight)
      const totalH = height + cardPadding

      // Find shortest column
      let shortest = 0
      for (let c = 1; c < colCount; c++) {
        if (colHeights[c] < colHeights[shortest]) shortest = c
      }

      result.push({
        ...item,
        x: shortest * (colWidth + gap),
        y: colHeights[shortest],
        w: colWidth,
        h: totalH,
      })
      colHeights[shortest] += totalH + gap
    }
    return result
  }

  onMount(() => {
    document.fonts.ready.then(() => {
      containerWidth = containerEl.clientWidth
      positioned = computeLayout(containerWidth)
    })

    const resizeObserver = new ResizeObserver(entries => {
      containerWidth = entries[0].contentRect.width
      positioned = computeLayout(containerWidth)
    })
    resizeObserver.observe(containerEl)
    return () => resizeObserver.disconnect()
  })
</script>

<div bind:this={containerEl} class="relative w-full" style="height: {Math.max(...positioned.map(p => p.y + p.h), 0)}px">
  {#each positioned as card}
    <div
      class="absolute bg-white rounded-xl shadow-md p-4"
      style="left: {card.x}px; top: {card.y}px; width: {card.w}px; height: {card.h}px;"
    >
      <p class="text-base leading-6 font-rubik text-off-black">{card.text}</p>
    </div>
  {/each}
</div>
```

### Recipe 2: Shrink-Wrapped Chat Bubble / Tooltip (Svelte)

Use when you want a container to be exactly as wide as its widest text line.

```svelte
<script>
  import { onMount } from 'svelte'
  import { prepareWithSegments, layout, walkLineRanges } from '@chenglou/pretext'

  export let text = ''

  const font = '16px Rubik'
  const lineHeight = 22
  const paddingH = 12
  const paddingV = 8

  let tightWidth = 0
  let tightHeight = 0

  onMount(() => {
    document.fonts.ready.then(() => {
      const maxWidth = 300 // max bubble width
      const contentMax = maxWidth - paddingH * 2
      const prepared = prepareWithSegments(text, font)

      // Get initial line count at max width
      const initial = layout(prepared, contentMax, lineHeight)

      // Binary search for the tightest width that keeps the same line count
      let lo = 1, hi = Math.ceil(contentMax)
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (layout(prepared, mid, lineHeight).lineCount <= initial.lineCount) {
          hi = mid
        } else {
          lo = mid + 1
        }
      }

      // Get the widest line at that tight width
      let maxLineWidth = 0
      walkLineRanges(prepared, lo, line => {
        if (line.width > maxLineWidth) maxLineWidth = line.width
      })

      tightWidth = Math.ceil(maxLineWidth) + paddingH * 2
      tightHeight = initial.lineCount * lineHeight + paddingV * 2
    })
  })
</script>

{#if tightWidth > 0}
  <div
    class="rounded-2xl bg-vibrant-pink text-white font-rubik"
    style="width: {tightWidth}px; padding: {paddingV}px {paddingH}px;"
  >
    {text}
  </div>
{/if}
```

### Recipe 3: Canvas Multiline Text Rendering (Vanilla JS in Svelte)

Use when drawing wrapped text onto a `<canvas>` (e.g. generating images, graphics).

```svelte
<script>
  import { onMount } from 'svelte'
  import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

  export let text = ''
  export let width = 400
  export let lineHeight = 26

  let canvas

  const font = '18px Rubik'

  onMount(() => {
    document.fonts.ready.then(() => {
      const ctx = canvas.getContext('2d')
      const prepared = prepareWithSegments(text, font)
      const { lines, height } = layoutWithLines(prepared, width, lineHeight)

      canvas.width = width * devicePixelRatio
      canvas.height = height * devicePixelRatio
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.scale(devicePixelRatio, devicePixelRatio)

      ctx.font = font
      ctx.fillStyle = '#1E1E1E'

      // The baseline offset is ~80% of the line height for most fonts
      const baselineOffset = lineHeight * 0.8

      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i].text, 0, i * lineHeight + baselineOffset)
      }
    })
  })
</script>

<canvas bind:this={canvas}></canvas>
```

### Recipe 4: Virtual List with Variable-Height Text Rows (Svelte)

Use when rendering a long list where each row has different text content and you need smooth scrolling without rendering all items.

```svelte
<script>
  import { onMount } from 'svelte'
  import { prepare, layout } from '@chenglou/pretext'

  export let items = [] // Array of { id, text, ... }

  const font = '16px Rubik'
  const lineHeight = 24
  const rowPadding = 24   // total vertical padding per row
  const overscan = 5      // extra items to render above/below viewport

  let heights = []        // precomputed height per item
  let offsets = []        // cumulative Y offset per item
  let totalHeight = 0
  let scrollTop = 0
  let viewportHeight = 0
  let containerEl

  function precomputeHeights(containerWidth) {
    const textWidth = containerWidth - 32 // horizontal padding
    heights = items.map(item => {
      const prepared = prepare(item.text, font)
      const { height } = layout(prepared, textWidth, lineHeight)
      return height + rowPadding
    })

    offsets = [0]
    for (let i = 1; i < heights.length; i++) {
      offsets[i] = offsets[i - 1] + heights[i - 1]
    }
    totalHeight = offsets.length > 0
      ? offsets[offsets.length - 1] + heights[heights.length - 1]
      : 0
  }

  // Find first visible index via binary search
  function findStartIndex(scrollTop) {
    let lo = 0, hi = offsets.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (offsets[mid] + heights[mid] < scrollTop) lo = mid + 1
      else hi = mid
    }
    return Math.max(0, lo - overscan)
  }

  $: visibleStart = findStartIndex(scrollTop)
  $: visibleEnd = (() => {
    let i = visibleStart
    while (i < items.length && offsets[i] < scrollTop + viewportHeight) i++
    return Math.min(items.length, i + overscan)
  })()

  $: visibleItems = items.slice(visibleStart, visibleEnd).map((item, i) => ({
    ...item,
    _y: offsets[visibleStart + i],
    _h: heights[visibleStart + i],
  }))

  onMount(() => {
    document.fonts.ready.then(() => {
      viewportHeight = containerEl.clientHeight
      precomputeHeights(containerEl.clientWidth)
    })
  })

  function handleScroll(e) {
    scrollTop = e.target.scrollTop
  }
</script>

<div
  bind:this={containerEl}
  on:scroll={handleScroll}
  class="relative overflow-auto"
  style="height: 600px;"
>
  <div style="height: {totalHeight}px; position: relative;">
    {#each visibleItems as item (item.id)}
      <div
        class="absolute left-0 right-0 px-4 py-3 border-b border-gray-100"
        style="top: {item._y}px; height: {item._h}px;"
      >
        <p class="text-base leading-6 font-rubik text-off-black">{item.text}</p>
      </div>
    {/each}
  </div>
</div>
```

### Recipe 5: Smart Truncation with "Read More" (Svelte)

Use when you need to truncate text to exactly N visible lines and show a "Read more" link.

```svelte
<script>
  import { onMount } from 'svelte'
  import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext'

  export let text = ''
  export let maxLines = 3
  export let containerWidth = 300

  const font = '16px Rubik'
  const lineHeight = 24

  let truncatedText = text
  let isTruncated = false
  let expanded = false

  onMount(() => {
    document.fonts.ready.then(() => {
      const prepared = prepareWithSegments(text, font)
      const { lines } = layoutWithLines(prepared, containerWidth, lineHeight)

      if (lines.length > maxLines) {
        isTruncated = true
        // Join text from lines 0..maxLines-1, trimming trailing space
        truncatedText = lines.slice(0, maxLines).map(l => l.text).join('').trimEnd() + '…'
      }
    })
  })
</script>

<div style="width: {containerWidth}px;">
  <p class="text-base leading-6 font-rubik text-off-black">
    {expanded ? text : truncatedText}
  </p>
  {#if isTruncated}
    <button
      class="text-vibrant-pink font-bold text-sm mt-1 hover:text-accent-gold transition-colors"
      on:click={() => expanded = !expanded}
    >
      {expanded ? 'Show less' : 'Read more'}
    </button>
  {/if}
</div>
```

### Recipe 6: Preventing Layout Shift on Dynamic Content (Svelte)

Use when new text loads asynchronously and you want to reserve the correct space before rendering.

```svelte
<script>
  import { prepare, layout } from '@chenglou/pretext'

  export let containerWidth = 0

  const font = '16px Rubik'
  const lineHeight = 24

  let text = ''
  let reservedHeight = 0
  let loaded = false

  async function loadContent() {
    // Simulate async text fetch
    const response = await fetch('/api/description')
    text = await response.text()

    // Calculate exact height BEFORE rendering
    const prepared = prepare(text, font)
    const { height } = layout(prepared, containerWidth, lineHeight)
    reservedHeight = height

    // Now render — no layout shift!
    loaded = true
  }
</script>

<div style="width: {containerWidth}px; min-height: {reservedHeight}px;">
  {#if loaded}
    <p class="text-base leading-6 font-rubik text-off-black">{text}</p>
  {:else}
    <div class="animate-pulse bg-gray-200 rounded" style="height: {reservedHeight}px;"></div>
  {/if}
</div>
```

---

## Implementation Checklist

When implementing a pretext-powered component:

- [ ] **Confirm the component runs client-side** — pretext needs `<canvas>`. Use `client:load` or `client:visible` on the Svelte island.
- [ ] **Match the font string to CSS** — For this project, use `'16px Rubik'` (adjust size/weight as needed). Never use `system-ui`.
- [ ] **Match lineHeight to CSS** — If your CSS says `leading-6` (= `line-height: 1.5rem` = `24px`), pass `24` to `layout()`.
- [ ] **Wait for font loading** — Wrap `prepare()` in `document.fonts.ready.then(...)` or use Svelte's `onMount`.
- [ ] **Use `prepare()` + `layout()` for height-only** — This is the fast path. Don't use `prepareWithSegments` unless you need line-level data.
- [ ] **Use `prepareWithSegments()` for line access** — When drawing to canvas, doing shrink-wrap, or building truncated text.
- [ ] **Call `prepare()` once, `layout()` many times** — `prepare()` is ~0.04ms per text. `layout()` is ~0.0002ms. Re-layout on resize is nearly free.
- [ ] **Handle resize** — Use `ResizeObserver` or window resize listener to re-call `layout()` (NOT `prepare()`) when container width changes.
