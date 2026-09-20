<!--
  Auto-seat: says what it is about to do before it does it, and reports what it
  managed afterwards. One undo step puts the room back.
-->
<script>
  import { getContext } from "svelte";

  let { onclose = () => {} } = $props();
  const { store, ui } = getContext("gala-seating");

  let onlyUnseated = $state(true);
  let respectLocked = $state(true);
  // Late Night Access tickets never get auto-seated: they have no dinner seat.
  const includeLateNight = false;
  let result = $state(/** @type {{placed:number, skipped:any[]}|null} */ (null));
  let running = $state(false);

  const stats = $derived(store.stats);
  const lockedCount = $derived(store.plan.tables.filter((t) => t.locked).length);

  async function run() {
    running = true;
    try {
      result = store.runAutoSeat({ onlyUnseated, respectLocked, includeLateNight });
    } catch (err) {
      console.error("[gala seating] auto-seat failed", err);
      store.pushToast({ kind: "error", message: "Auto-seat did not run. Nothing was changed." });
      onclose();
    } finally {
      running = false;
    }
  }

  function guestName(id) {
    return store.plan.guests[id]?.name || "A guest";
  }
</script>

<div class="as-scrim" role="presentation" onpointerdown={onclose}></div>
<div class="as gs-sheet" role="dialog" aria-modal="true" aria-label="Auto-seat">
  {#if result}
    <h2 class="gs-serif">Auto-seat finished</h2>
    <p class="as-lead">
      Seated <strong>{result.placed}</strong>
      {result.placed === 1 ? "guest" : "guests"}.
      {#if result.skipped?.length}
        {result.skipped.length} could not be placed.
      {/if}
    </p>
    {#if result.skipped?.length}
      <ul class="as-skipped gs-scroll">
        {#each result.skipped.slice(0, 40) as s, i (i)}
          <li>
            <button type="button" class="gs-linkbtn" onclick={() => ui.pickGuest(s.guestId)}>{guestName(s.guestId)}</button>
            <span>{s.reason}</span>
          </li>
        {/each}
      </ul>
    {/if}
    <p class="as-note">One Undo puts the whole room back the way it was.</p>
    <div class="as-actions">
      <button type="button" class="gs-btn gs-btn--gold" onclick={onclose}>Done</button>
      <button
        type="button"
        class="gs-btn"
        onclick={() => {
          store.undo();
          onclose();
        }}
      >
        Undo it
      </button>
    </div>
  {:else}
    <h2 class="gs-serif">Auto-seat</h2>
    <p class="as-lead">
      Fills seats by party first, then by what people asked for in their seating notes, and keeps
      the "keep together" and "keep apart" pairs you have set. It never touches a locked table.
    </p>

    <div class="as-opts">
      <label>
        <input type="radio" checked={onlyUnseated} onchange={() => (onlyUnseated = true)} />
        <span>
          <strong>Only the unseated</strong>
          <small>{stats.unseated} waiting · everyone already seated stays exactly where they are</small>
        </span>
      </label>
      <label>
        <input type="radio" checked={!onlyUnseated} onchange={() => (onlyUnseated = false)} />
        <span>
          <strong>Reshuffle everyone</strong>
          <small>Empties every unlocked table and starts the arrangement again</small>
        </span>
      </label>
    </div>

    <div class="as-checks">
      <label>
        <input type="checkbox" checked={respectLocked} onchange={(e) => (respectLocked = e.currentTarget.checked)} />
        Leave locked tables alone{lockedCount ? ` (${lockedCount} locked)` : ""}
      </label>
    </div>

    <p class="as-note">
      A backup is taken first, and the whole run undoes in one step. Late Night Access tickets are
      left out: they do not include dinner.
    </p>

    <div class="as-actions">
      <button type="button" class="gs-btn gs-btn--gold" onclick={run} disabled={running}>
        {running ? "Working…" : onlyUnseated ? `Seat ${stats.unseated} guests` : "Reshuffle the room"}
      </button>
      <button type="button" class="gs-btn" onclick={onclose}>Cancel</button>
    </div>
  {/if}
</div>

<style>
  .as-scrim {
    position: fixed;
    inset: 0;
    background: rgba(4, 8, 14, 0.62);
    z-index: 70;
  }
  .as {
    position: fixed;
    z-index: 71;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, calc(100vw - 24px));
    max-height: min(86dvh, 700px);
    overflow-y: auto;
    background: var(--gs-cream);
    color: var(--gs-ink);
    border-top: 3px solid var(--gs-gold);
    padding: 22px;
    box-shadow: 0 40px 90px -40px rgba(0, 0, 0, 0.95);
  }
  .as h2 {
    margin: 0 0 10px;
    font-size: 23px;
  }
  .as-lead {
    margin: 0 0 16px;
    font-size: 13px;
    line-height: 1.6;
    color: #4a525f;
  }
  .as-lead strong {
    color: var(--gs-ink);
  }
  .as-opts {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;
  }
  .as-opts label {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border: 1px solid rgba(23, 32, 44, 0.18);
    border-radius: 2px;
    background: #fffdf9;
    cursor: pointer;
  }
  .as-opts label:hover {
    background: rgba(255, 189, 89, 0.16);
  }
  .as-opts span {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .as-opts strong {
    font-size: 13px;
  }
  .as-opts small,
  .as-note {
    font-size: 11.5px;
    color: #78818f;
    line-height: 1.5;
  }
  .as-checks {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;
    font-size: 12.5px;
  }
  .as-checks label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .as-note {
    margin: 0 0 16px;
  }
  .as-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .as-skipped {
    list-style: none;
    margin: 0 0 14px;
    padding: 0;
    max-height: 220px;
    font-size: 12.5px;
  }
  .as-skipped li {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid rgba(23, 32, 44, 0.08);
  }
  .as-skipped span {
    color: #78818f;
    font-size: 11.5px;
    text-align: right;
  }

  /* The phone shell is sized to the visible viewport and this dialog lives
     inside it, so it anchors to the shell rather than to the layout viewport
     that Safari keeps changing under it. */
  @media (max-width: 1023px), (pointer: coarse) and (max-height: 599px) {
    .as-scrim,
    .as {
      position: absolute;
    }
    .as {
      left: 0;
      right: 0;
      bottom: 0;
      top: auto;
      transform: none;
      width: auto;
      max-height: 92%;
      border-radius: 6px 6px 0 0;
      padding-bottom: calc(14px + env(safe-area-inset-bottom));
    }
  }
</style>
