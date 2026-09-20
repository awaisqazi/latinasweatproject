<!--
  The thing under your finger while you drag: a small cream card that follows
  the pointer, the placement hint, and the "Unseat" drop zone that only appears
  while a seated guest is in the air.

  It also blocks touch scrolling for the duration of a drag, which is the one
  reliable way to keep a phone from scrolling the page mid-drop.
-->
<script>
  import { getContext } from "svelte";

  const { store, ui } = getContext("gala-seating");

  const drag = $derived(ui.drag);
  const seatedDrag = $derived(Boolean(drag?.guestId && store.plan.seating[drag.guestId]));

  $effect(() => {
    if (!drag) return;
    const block = (e) => e.preventDefault();
    window.addEventListener("touchmove", block, { passive: false });
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("touchmove", block);
      document.body.style.userSelect = "";
    };
  });
</script>

{#if drag}
  <div class="dl-ghost" data-level={drag.level} style={`left:${drag.x}px; top:${drag.y}px;`}>
    <span class="dl-name">{drag.label}</span>
    {#if drag.kind === "party"}
      <span class="dl-count">{drag.count} seats</span>
    {/if}
    {#if drag.heldBy}
      <span class="dl-held" style={`color:${drag.heldBy.color}`}>{drag.heldBy.editor} is moving this right now.</span>
    {/if}
    {#if drag.message}
      <span class="dl-msg">{drag.message}</span>
    {/if}
  </div>

  {#if seatedDrag}
    <div class="dl-unseat" data-unseat-zone="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      Drop here to unseat
    </div>
  {/if}
{/if}

<style>
  .dl-ghost {
    position: fixed;
    z-index: 90;
    transform: translate(-50%, -150%);
    pointer-events: none;
    background: var(--gs-cream);
    color: var(--gs-ink);
    border: 1px solid var(--gs-gold);
    border-left: 4px solid var(--gs-gold-bright);
    padding: 7px 11px;
    max-width: 62vw;
    box-shadow: 0 18px 40px -18px rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .dl-ghost[data-level="warn"] {
    border-left-color: var(--gs-warn);
  }
  .dl-ghost[data-level="error"] {
    border-left-color: var(--gs-error);
  }
  .dl-name {
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dl-count {
    font-size: 11px;
    opacity: 0.7;
  }
  .dl-held {
    font-size: 11px;
    font-weight: 700;
  }
  .dl-msg {
    font-size: 11px;
    max-width: 44ch;
    color: #6b4a12;
  }
  .dl-ghost[data-level="error"] .dl-msg {
    color: #8c2f22;
  }

  .dl-unseat {
    position: fixed;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    z-index: 88;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 18px;
    min-height: 52px;
    background: rgba(11, 19, 32, 0.95);
    border: 1px dashed var(--gs-error);
    color: #ffd2ca;
    font-size: 13px;
    border-radius: 3px;
    /* Hittable so elementFromPoint finds it on drop; the drag itself is driven
       by window listeners, so this never steals the pointer. */
    pointer-events: auto;
  }
  .dl-unseat svg {
    width: 18px;
    height: 18px;
  }
</style>
