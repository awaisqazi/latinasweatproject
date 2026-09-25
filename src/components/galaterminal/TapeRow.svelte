<!--
  One line of the shared tape.

  Three kinds of line land here, and only the first is a row the database knows
  about:

    · a SERVER row, the truth, carrying who keyed it and what happened to it
    · a QUEUED entry, still on this device, named from the check-in roster so the
      clerk sees who they just keyed without waiting for the round trip
    · a DUPLICATE note, which is not an error: the other clerk keyed that paddle
      at this level first, the server kept one gift, and this line says who

  The name here is the GUEST's, which is not the name the projector shows
  (10 s6). A clerk has to be able to say "Paddle 45, Ana, five hundred" out loud.
-->
<script>
  import { AlertTriangle, Ban, Clock, Eye, EyeOff, Pencil, RotateCcw, Users } from "@lucide/svelte";
  import { agoLabel, money, rowName, rowState } from "../../lib/galaTerminal/derive.js";

  let { row = null, queued = null, dupe = null, name = "", now = Date.now(), actionable = false, onfix = () => {}, store } = $props();

  const st = $derived(row ? rowState(row) : "");
  const paddle = $derived(row ? (row.paddle_number ?? row.called_number) : (queued?.paddle ?? dupe?.paddle));
  const cents = $derived(row ? row.amount_cents : (queued?.cents ?? dupe?.cents));
  const when = $derived(row ? agoLabel(row.created_at, now) : agoLabel(new Date(queued?.at ?? dupe?.at ?? now).toISOString(), now));

  const STATE_WORD = { live: "On screen", pending: "About to show", retracted: "Pulled back", voided: "Voided", hidden: "Off screen" };
</script>

<div
  class="tr"
  class:tr--dupe={Boolean(dupe)}
  class:tr--queued={Boolean(queued)}
  class:tr--stuck={queued?.state === "failed"}
  class:tr--void={st === "voided"}
  class:tr--retracted={st === "retracted"}
  class:tr--review={row?.needs_review && !row?.voided_at}
>
  <div class="tr-paddle" aria-hidden="true">{paddle ?? "-"}</div>

  <div class="tr-body">
    <p class="tr-line">
      <span class="tr-name">
        {#if dupe}
          Paddle {dupe.paddle} was already keyed
        {:else if row}
          {rowName(row)}
        {:else}
          {name || `Paddle ${queued?.paddle ?? ""}`}
        {/if}
      </span>
      <span class="tr-amt">{money(cents)}</span>
    </p>

    <p class="tr-meta">
      {#if dupe}
        <span class="tr-tag tr-tag--calm"><Users size={11} strokeWidth={2.6} /> {dupe.by} got there first</span>
      {:else if queued}
        {#if queued.state === "failed"}
          <span class="tr-tag tr-tag--bad"><AlertTriangle size={11} strokeWidth={2.6} /> Not saved</span>
          <button type="button" class="tr-act" onclick={() => store.retryItem(queued.op)}>Retry</button>
          <button type="button" class="tr-act" onclick={() => store.discardItem(queued.op)}>Discard</button>
        {:else if queued.state === "sending"}
          <span class="tr-tag"><Clock size={11} strokeWidth={2.6} /> Saving</span>
        {:else if queued.state === "done"}
          <span class="tr-tag tr-tag--ok">Saved</span>
        {:else}
          <span class="tr-tag tr-tag--wait"><Clock size={11} strokeWidth={2.6} /> Queued on this device</span>
        {/if}
      {:else if row}
        <span class="tr-tag tr-tag--{st}">{STATE_WORD[st] || st}</span>
        {#if row.needs_review}
          <span class="tr-tag tr-tag--bad"><AlertTriangle size={11} strokeWidth={2.6} /> Needs review</span>
        {/if}
        {#if row.kind !== "pledge"}<span class="tr-tag">{row.kind}</span>{/if}
        {#if row.anonymous}<span class="tr-tag">anonymous</span>{/if}
        <span class="tr-by">#{row.seq} · {row.entered_by}</span>
      {/if}
      {#if when}<span class="tr-by">{when}</span>{/if}
    </p>
  </div>

  {#if row && actionable}
    <div class="tr-tools">
      {#if !row.voided_at}
        {#if row.retracted_at}
          <button type="button" class="tr-btn" onclick={() => store.unretract(row.id)} title="Put it back on the screen">
            <Eye size={15} strokeWidth={2.2} /> Restore
          </button>
        {:else}
          <button type="button" class="tr-btn" onclick={() => store.retract(row.id, "clerk pulled it back")} title="Take it off the screen, keep the money in the books">
            <EyeOff size={15} strokeWidth={2.2} /> Retract
          </button>
        {/if}
      {/if}
      <button type="button" class="tr-btn" onclick={() => onfix(row)} title="Fix the amount, the donor or the paddle">
        {#if row.voided_at}<Ban size={15} strokeWidth={2.2} />{:else}<Pencil size={15} strokeWidth={2.2} />{/if} Fix
      </button>
    </div>
  {/if}
  {#if queued?.state === "waiting" && !(queued.tries > 0)}
    <!-- Only an entry that was never attempted can be dropped locally. After a
         timed-out attempt the server may already hold it: let it land, then
         pull it back from this row, so the screen never keeps a ghost gift. -->
    <div class="tr-tools">
      <button type="button" class="tr-btn" onclick={() => store.discardItem(queued.op)} title="Drop it before it is sent">
        <RotateCcw size={15} strokeWidth={2.2} /> Drop
      </button>
    </div>
  {/if}
</div>

<style>
  .tr {
    display: grid;
    grid-template-columns: 62px 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid rgb(228 201 138 / 0.12);
  }
  .tr--queued {
    background: rgb(255 189 89 / 0.07);
  }
  .tr--stuck {
    background: rgb(255 138 122 / 0.12);
  }
  /* The other clerk was first. Grey, calm, not an error (08 s7.2). */
  .tr--dupe {
    opacity: 0.62;
  }
  .tr--void .tr-name,
  .tr--void .tr-amt {
    text-decoration: line-through;
    opacity: 0.6;
  }
  .tr--retracted .tr-amt {
    opacity: 0.6;
  }
  .tr--review {
    box-shadow: inset 3px 0 0 var(--g26-alert);
  }

  .tr-paddle {
    display: grid;
    place-items: center;
    min-height: 44px;
    font-size: 24px;
    font-weight: 800;
    line-height: 1;
    font-variant-numeric: tabular-nums lining-nums;
    color: var(--g26-gold-soft);
    background: var(--g26-surface-1);
    border: 1px solid var(--g26-line);
    border-radius: var(--g26-r-ctl);
  }
  .tr--dupe .tr-paddle {
    color: var(--g26-dim);
  }

  .tr-body {
    min-width: 0;
  }
  .tr-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin: 0;
  }
  .tr-name {
    flex: 1;
    min-width: 0;
    font-size: 17px;
    font-weight: 700;
    color: var(--g26-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tr-amt {
    flex: none;
    font-size: 19px;
    font-weight: 800;
    font-variant-numeric: tabular-nums lining-nums;
    color: var(--g26-cream);
  }

  .tr-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 3px 0 0;
    font-size: 11px;
    color: var(--g26-dim);
  }
  .tr-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--g26-muted);
    border: 1px solid var(--g26-line);
    border-radius: 999px;
  }
  .tr-tag--live,
  .tr-tag--ok {
    color: var(--g26-ok);
    border-color: rgb(95 212 184 / 0.5);
  }
  .tr-tag--pending,
  .tr-tag--wait {
    color: var(--g26-gold);
    border-color: var(--g26-line-strong);
  }
  .tr-tag--bad,
  .tr-tag--voided {
    color: var(--g26-alert);
    border-color: rgb(255 138 122 / 0.5);
  }
  .tr-tag--calm {
    color: var(--g26-dim);
  }
  .tr-by {
    font-variant-numeric: tabular-nums;
  }

  .tr-tools {
    display: flex;
    gap: 6px;
  }
  .tr-btn,
  .tr-act {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 40px;
    padding: 0 10px;
    font-family: var(--g26-sans);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--g26-muted);
    background: transparent;
    border: 1px solid var(--g26-line);
    border-radius: var(--g26-r-ctl);
    cursor: pointer;
  }
  .tr-act {
    min-height: 26px;
    padding: 0 8px;
    color: var(--g26-alert);
    border-color: rgb(255 138 122 / 0.5);
  }
  .tr-btn:focus-visible,
  .tr-act:focus-visible {
    outline: none;
    box-shadow: var(--g26-focus);
  }

  /* A volunteer's own phone: 56px targets, and the tools drop under the row
     instead of squeezing the amount off the screen. */
  @media (max-width: 720px) {
    .tr {
      grid-template-columns: 54px 1fr;
    }
    .tr-tools {
      grid-column: 1 / -1;
    }
    .tr-btn {
      flex: 1;
      justify-content: center;
      min-height: 56px;
    }
  }
</style>
