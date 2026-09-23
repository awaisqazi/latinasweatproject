<script>
  // The live total module on /lspgala, the gala-night hub guests reach from
  // the "scan to give" QR on the program and the paddles.
  //
  // Data: docs/gala-2026/10-display-rpc-contract.md, through the projector's
  // own transport (src/lib/galaLive/giftFeed.js). No second copy of the
  // transport lives here.
  //
  // Rules this file keeps:
  //   * guest phones poll at the server's poll_ms (about 10 s), never faster,
  //     never websockets, and not at all while the tab is hidden. 150 phones
  //     share a small Supabase plan;
  //   * without a display key this is totals only. With `#k=<key>` in the
  //     fragment it may show the latest names, exactly as the projector would.
  //     The key is read with readDisplayKey(), never put in a query string and
  //     never logged;
  //   * it never touches the projector's cursor record (persist: false);
  //   * a failed poll changes nothing: the last known total stays up with a
  //     quiet "updated Xs ago".
  //
  // It also upgrades two server-rendered links on the page, which work without
  // JavaScript on their own:
  //   [data-gala-give]  takes state.config.donate_url when the operator has set
  //                     one (same runtime setting as the projector's QR);
  //   [data-gala-watch] carries the display key through to /gala/live.

  import { onMount } from "svelte";
  import { createGiftFeed, readDisplayKey } from "../../../lib/galaLive/giftFeed.js";
  import { DEFAULT_EVENT, COPY, money } from "../../../lib/galaLive/config.js";

  let { fallbackGiveUrl = "" } = $props();

  const ROLL_MAX = 6;

  let snap = $state(null); // last good payload, raw from the server
  let rollRows = $state([]); // [{seq, name, cents}] newest first, keyed mode only
  let named = $state(false);
  let lastOkAt = $state(0);
  let now = $state(Date.now());
  let failing = $state(false);

  const live = $derived(snap?.live === true);
  const totalCents = $derived(Number(snap?.total_cents) || 0);
  const giftCount = $derived(Number(snap?.gift_count) || 0);
  const pollMs = $derived(Math.max(1000, Number(snap?.poll_ms) || 10000));

  // Goal: shown only when the server has one set. The compiled 75,000 default
  // the projector falls back on is never shown here as if it were real. A live
  // stretch goal (contract section 1: stretch.active + stretch.goal_cents)
  // replaces the goal once it is above it.
  const baseGoal = $derived(Number(snap?.goal_cents) || 0);
  const stretchGoal = $derived(
    snap?.stretch?.active === true && Number(snap.stretch.goal_cents) > baseGoal
      ? Number(snap.stretch.goal_cents)
      : 0,
  );
  const goalCents = $derived(stretchGoal || baseGoal);
  const goalVisible = $derived(live && goalCents > 0);
  const pct = $derived(goalCents > 0 ? totalCents / goalCents : 0);
  const pctLabel = $derived(Math.floor(pct * 100));
  const goalLabel = $derived(
    stretchGoal
      ? `${String(snap?.stretch?.label || "").trim() || "Stretch goal"} · ${money(stretchGoal)}`
      : COPY.ofGoal.replace("GOAL", money(goalCents)),
  );

  const levelCents = $derived(live ? snap?.current_level_cents : null);
  const impactLine = $derived(
    (Array.isArray(snap?.levels) ? snap.levels : []).find(
      (l) => Number(l?.amount_cents) === Number(levelCents),
    )?.impact_line || "",
  );
  const message = $derived(live ? String(snap?.message || "").trim() : "");
  const showRoll = $derived(live && named && rollRows.length > 0);

  const agoS = $derived(lastOkAt ? Math.max(0, Math.round((now - lastOkAt) / 1000)) : 0);
  const stale = $derived(lastOkAt > 0 && now - lastOkAt > pollMs * 3 + 5000);
  const agoLabel = $derived(
    !lastOkAt
      ? ""
      : agoS < 15
        ? "Updated just now"
        : agoS < 120
          ? `Updated ${agoS}s ago`
          : `Updated ${Math.round(agoS / 60)} min ago`,
  );

  function safeUrl(raw) {
    try {
      const u = new URL(String(raw || "").trim());
      return u.protocol === "https:" ? u.href : "";
    } catch {
      return "";
    }
  }

  function applyGiveUrl(payload) {
    const runtime = safeUrl(payload?.config?.donate_url);
    const href = runtime || fallbackGiveUrl;
    if (!href) return;
    for (const a of document.querySelectorAll("a[data-gala-give]")) {
      if (a.getAttribute("href") !== href) a.setAttribute("href", href);
    }
  }

  function giftName(g, showNames) {
    if (!showNames || g?.anonymous === true) return COPY.anonymous;
    return String(g?.display_name || "").trim() || COPY.anonymous;
  }

  // Upsert by seq (contract section 2, rule 6), drop retractions, keep the
  // newest few. `fresh` = the first answer of a new feed, which starts at
  // cursor 0 and so carries the whole published history: rebuild from it so a
  // gift retracted while the tab was hidden cannot linger.
  const bySeq = new Map();
  function applyRoll(payload, fresh) {
    if (fresh) bySeq.clear();
    const showNames = payload.show_names !== false;
    for (const g of payload.gifts || []) {
      const seq = Number(g?.seq);
      if (!Number.isFinite(seq)) continue;
      bySeq.set(seq, { seq, name: giftName(g, showNames), cents: Number(g.amount_cents) || 0 });
    }
    // Retractions last, so a seq that is in both lists ends up removed.
    for (const seq of payload.retractions || []) bySeq.delete(Number(seq));
    // show_names can flip without any gift changing: re-label what we hold.
    if (!showNames) for (const row of bySeq.values()) row.name = COPY.anonymous;
    rollRows = [...bySeq.values()].sort((a, b) => b.seq - a.seq).slice(0, ROLL_MAX);
    while (bySeq.size > 200) bySeq.delete(Math.min(...bySeq.keys()));
  }

  // giftFeed drives a director on the projector. The hub has no stage, so it
  // hands the feed an inert one and reads everything it needs from onState.
  const inertDirector = {
    restoreMilestones() {},
    milestonesHit: () => [],
    retract() {},
    receiveGift() {},
    reconcile() {},
    sealMilestones() {},
    snapTotals() {},
  };

  onMount(() => {
    const key = readDisplayKey();

    if (key) {
      for (const a of document.querySelectorAll("a[data-gala-watch]")) {
        const base = (a.getAttribute("href") || "/gala/live").split("#")[0];
        a.setAttribute("href", `${base}#k=${encodeURIComponent(key)}`);
      }
    }

    let feed = null;
    let fresh = true;

    function startFeed() {
      if (feed) return;
      fresh = true;
      feed = createGiftFeed({
        event: DEFAULT_EVENT,
        key,
        director: inertDirector,
        persist: false,
        followServerPoll: true,
        onStatus: (s) => {
          failing = !!s.lastError;
        },
        onState: (payload, io) => {
          failing = false;
          lastOkAt = Date.now();
          named = io?.mode === "display" && payload.named === true;
          if (named) applyRoll(payload, fresh);
          else rollRows = [];
          fresh = false;
          snap = payload;
          applyGiveUrl(payload);
        },
      });
      feed.start();
    }

    function stopFeed() {
      feed?.stop();
      feed = null;
    }

    const onVis = () => {
      if (document.hidden) stopFeed();
      else {
        now = Date.now();
        startFeed();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) startFeed();

    const tick = setInterval(() => {
      if (!document.hidden) now = Date.now();
    }, 5000);

    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
      stopFeed();
    };
  });
</script>

<section class="hub-live" aria-live="polite" aria-busy={snap === null}>
  {#if snap === null}
    <div class="calm">
      <div class="eyebrow">{COPY.raisedTonight}</div>
      <p class="calm-line">{failing ? "The live total will appear here when the connection returns." : "Connecting to the live total"}</p>
    </div>
  {:else if !live}
    <div class="calm">
      <div class="eyebrow">{COPY.raisedTonight}</div>
      <p class="calm-line">The live total appears here during the paddle raise.</p>
    </div>
  {:else}
    <div class="eyebrow">{COPY.raisedTonight}</div>
    <div class="total">{money(totalCents)}</div>

    {#if goalVisible}
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.min(100, pctLabel)} aria-label="Progress toward the goal">
        <div class="fill" style={`width: ${Math.min(100, Math.max(0, pct * 100))}%`}></div>
      </div>
      <div class="goal">{goalLabel} · <b>{pctLabel}%</b></div>
    {/if}

    <div class="count">{giftCount.toLocaleString("en-US")} {giftCount === 1 ? "gift" : "gifts"}</div>

    {#if levelCents}
      <div class="level">
        <div class="level-eyebrow">{COPY.askLevel}</div>
        <div class="level-num">{money(levelCents)}</div>
        {#if impactLine}<div class="impact">{impactLine}</div>{/if}
      </div>
    {/if}

    {#if message}<p class="msg">{message}</p>{/if}

    {#if showRoll}
      <ul class="roll" aria-label="Latest gifts">
        {#each rollRows as row (row.seq)}
          <li><span class="who">{row.name}</span><span class="amt">{money(row.cents)}</span></li>
        {/each}
      </ul>
    {/if}
  {/if}

  {#if agoLabel && live}
    <div class="ago" class:stale>
      <span class="dot" aria-hidden="true"></span>{agoLabel}
    </div>
  {/if}
</section>

<style>
  .hub-live {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 26px 20px 20px;
    border: 1px solid rgba(255, 189, 89, 0.28);
    border-radius: 4px;
    background:
      radial-gradient(120% 90% at 50% 0%, rgba(255, 189, 89, 0.1), transparent 70%),
      var(--g26-navy);
    text-align: center;
    min-height: 168px;
  }
  .eyebrow,
  .level-eyebrow {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--g26-gold-soft);
  }
  .calm {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 8px 0 4px;
  }
  .calm-line {
    margin: 0;
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: 21px;
    line-height: 1.35;
    color: var(--g26-cream);
    max-width: 22ch;
  }
  .total {
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: clamp(52px, 17vw, 84px);
    line-height: 1.02;
    color: var(--g26-cream);
    font-variant-numeric: tabular-nums lining-nums;
    text-shadow: 0 0 34px rgba(255, 189, 89, 0.22);
  }
  .bar {
    width: 100%;
    height: 6px;
    margin-top: 4px;
    border-radius: 3px;
    background: rgba(255, 248, 239, 0.12);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(90deg, var(--g26-gold-deep), var(--g26-gold) 70%, var(--g26-gold-hi));
    transition: width 1.2s var(--g26-ease);
  }
  .goal {
    font-size: 16px;
    font-weight: 600;
    color: var(--g26-warm);
  }
  .goal b {
    color: var(--g26-gold);
  }
  .count {
    font-size: 15px;
    color: var(--g26-muted);
    font-variant-numeric: tabular-nums;
  }
  .level {
    width: 100%;
    margin-top: 8px;
    padding-top: 14px;
    border-top: 1px solid rgba(255, 248, 239, 0.12);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .level-num {
    font-family: var(--g26-serif);
    font-size: 40px;
    line-height: 1.1;
    color: var(--g26-gold);
    font-variant-numeric: tabular-nums lining-nums;
  }
  .impact {
    font-size: 17px;
    color: var(--g26-warm);
  }
  .msg {
    margin: 6px 0 0;
    font-size: 17px;
    line-height: 1.4;
    color: var(--g26-cream);
  }
  .roll {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    width: 100%;
    text-align: left;
    border-top: 1px solid rgba(255, 248, 239, 0.12);
  }
  .roll li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 2px;
    border-bottom: 1px solid rgba(255, 248, 239, 0.08);
    font-size: 16px;
  }
  .who {
    color: var(--g26-cream);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .amt {
    color: var(--g26-gold);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .ago {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 6px;
    font-size: 13px;
    color: var(--g26-dim);
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--g26-ok);
    box-shadow: 0 0 8px rgba(95, 212, 184, 0.7);
  }
  .ago.stale .dot {
    background: var(--g26-taupe);
    box-shadow: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
