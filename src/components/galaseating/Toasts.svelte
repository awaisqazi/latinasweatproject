<!--
  Two stacks in one corner.

  Ordinary toasts confirm something or offer an Undo. Collision notices are the
  amber ones: they only appear when two planners landed on the same thing, they
  stay until dismissed, and they are announced assertively because the planner
  needs to look up from what they were doing.
-->
<script>
  import { getContext } from "svelte";

  const { store, ui } = getContext("gala-seating");

  function runAction(action, id) {
    action.run?.();
    store.dismissToast(id);
  }

  function runCollisionAction(action, notice) {
    if (action.kind === "find") {
      ui.revealInList(action.guestId);
      ui.openGuest(action.guestId);
    } else if (action.kind === "seat") {
      store.seatGuest(action.guestId, action.tableId, null);
    }
    store.dismissCollision(notice.id);
  }
</script>

<div class="tt" aria-live="assertive" aria-atomic="false">
  {#each store.collisions as notice (notice.id)}
    <div class="tt-col" style={`--gs-them:${notice.color || "#FFBD59"}`}>
      <p class="tt-colmsg">{notice.message}</p>
      <div class="tt-colrow">
        {#each notice.actions || [] as action, i (i)}
          <button type="button" class="gs-btn" onclick={() => runCollisionAction(action, notice)}>
            {action.label}
          </button>
        {/each}
        <button type="button" class="gs-linkbtn tt-dismiss" onclick={() => store.dismissCollision(notice.id)}>
          Dismiss
        </button>
      </div>
    </div>
  {/each}
</div>

<div class="tt tt--plain" aria-live="polite" aria-atomic="false">
  {#each store.toasts as toast (toast.id)}
    <div class="tt-item" data-kind={toast.kind}>
      <div class="tt-body">
        <p>{toast.message}</p>
        {#if toast.detail}<small>{toast.detail}</small>{/if}
      </div>
      {#if toast.action}
        <button type="button" class="gs-btn" onclick={() => runAction(toast.action, toast.id)}>
          {toast.action.label}
        </button>
      {/if}
      <button type="button" class="tt-x" onclick={() => store.dismissToast(toast.id)} aria-label="Dismiss">
        &times;
      </button>
    </div>
  {/each}
</div>

<style>
  .tt {
    position: fixed;
    right: 14px;
    bottom: 14px;
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: min(420px, calc(100vw - 28px));
    pointer-events: none;
  }
  .tt--plain {
    bottom: 14px;
  }
  .tt > * {
    pointer-events: auto;
  }
  .tt-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    background: rgba(11, 19, 32, 0.97);
    border: 1px solid rgba(228, 201, 138, 0.35);
    border-left: 3px solid var(--gs-gold-soft);
    color: var(--gs-text);
    box-shadow: 0 18px 44px -22px rgba(0, 0, 0, 0.95);
  }
  .tt-item[data-kind="ok"] {
    border-left-color: var(--gs-ok);
  }
  .tt-item[data-kind="warn"] {
    border-left-color: var(--gs-warn);
  }
  .tt-item[data-kind="error"] {
    border-left-color: var(--gs-error);
  }
  .tt-body {
    flex: 1 1 auto;
    min-width: 0;
  }
  .tt-body p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.45;
  }
  .tt-body small {
    display: block;
    margin-top: 2px;
    font-size: 11px;
    color: #98a4b3;
  }
  .tt-x {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    min-height: 24px;
    background: none;
    border: none;
    color: #8f9bab;
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }
  .tt-x:hover {
    color: var(--gs-cream);
  }

  /* Collision notices: amber, louder, and they wait for you. */
  .tt-col {
    padding: 12px 13px;
    background: #2a2213;
    border: 1px solid var(--gs-warn);
    border-left: 4px solid var(--gs-them, var(--gs-warn));
    color: #ffeccd;
    box-shadow: 0 20px 50px -22px rgba(0, 0, 0, 0.95);
  }
  .tt-colmsg {
    margin: 0 0 9px;
    font-size: 13px;
    line-height: 1.5;
  }
  .tt-colrow {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }
  .tt-colrow :global(.gs-btn) {
    border-color: rgba(255, 189, 89, 0.6);
    color: #ffeccd;
  }
  .tt-dismiss {
    margin-left: auto;
    font-size: 12px;
    color: #d8c49a;
  }

  @media (max-width: 1023px) {
    .tt {
      left: 10px;
      right: 10px;
      bottom: 74px;
      max-width: none;
    }
  }
</style>
