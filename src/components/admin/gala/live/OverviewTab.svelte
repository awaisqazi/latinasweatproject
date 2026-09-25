<!--
  Overview: the one screen a lead glances at all night. Every number here
  comes from the SAME store the check-in desk and paddles tab read (rule:
  one shared store per browser tab), plus the pledge terminal's own totals
  for money. `remote.stats()` is polled separately for the arrivals-per-5-
  minutes bar, because that series only exists in gala_checkin_stats_json
  (docs/gala-2026/06 s9), not in the client-derived stats.
-->
<script>
  import { onDestroy } from "svelte";
  import { RefreshCw, Copy, Check, ExternalLink } from "@lucide/svelte";
  import QRCode from "qrcode";
  import { money } from "../../../../lib/galaTerminal/derive.js";
  import { clockTime } from "../../../../lib/galaCheckin/derive.js";

  let { checkin, terminal, remote, event } = $props();

  const totals = $derived(checkin.stats.totals);
  const byTable = $derived(checkin.stats.by_table);
  const byTicketType = $derived(checkin.stats.by_ticket_type);
  const paddles = $derived(checkin.stats.paddles);
  const nextFree = $derived.by(() => {
    const nums = Object.values(checkin.paddles)
      .filter((p) => p.status === "free")
      .map((p) => p.paddle_number)
      .sort((a, b) => a - b);
    return nums[0] ?? null;
  });

  const moneyTotals = $derived(terminal.totals);
  const byLevel = $derived(terminal.byLevel);

  // ---- server-side arrivals-per-5-minutes, polled independently -----------
  // gala_checkin_stats returns { ok, stats: { ...gala_checkin_stats_json },
  // recent, devices }; arrivals_5min rows are { t: timestamptz, n: count }
  // (docs/gala-2026/06-checkin-concurrency-design.md lines 1586-1591).
  let arrivals5 = $state.raw([]);
  let statsTimer = 0;
  async function pullStats() {
    if (!remote) return;
    const res = await remote.stats();
    if (res?.ok && Array.isArray(res.stats?.arrivals_5min)) arrivals5 = res.stats.arrivals_5min;
  }
  pullStats();
  statsTimer = setInterval(pullStats, 30000);
  onDestroy(() => clearInterval(statsTimer));
  const maxArrivals = $derived(Math.max(1, ...arrivals5.map((b) => Number(b.n) || 0)));

  // ---- share links ----------------------------------------------------------
  function absoluteUrl(path) {
    try { return new URL(path, window.location.origin).toString(); } catch { return path; }
  }
  const links = $derived([
    { id: "checkin", label: "Volunteer check-in", url: absoluteUrl("/gala/volunteer-checkin") },
    { id: "pledges", label: "Pledges", url: absoluteUrl("/gala/pledges") },
  ]);
  let qrByUrl = $state.raw({});
  let copiedId = $state("");

  $effect(() => {
    for (const link of links) {
      if (qrByUrl[link.url]) continue;
      QRCode.toDataURL(link.url, { errorCorrectionLevel: "M", margin: 1, width: 240, color: { dark: "#05070C", light: "#FFF8EF" } })
        .then((dataUrl) => { qrByUrl = { ...qrByUrl, [link.url]: dataUrl }; })
        .catch(() => {});
    }
  });

  async function copyLink(link) {
    try {
      await navigator.clipboard.writeText(link.url);
      copiedId = link.id;
      setTimeout(() => { if (copiedId === link.id) copiedId = ""; }, 1800);
    } catch { /* clipboard blocked; the link is still visible to copy by hand */ }
  }
</script>

<div class="ov-grid">
  <section class="ov-panel">
    <h2 class="ov-h">Arrivals</h2>
    <div class="ov-tiles">
      <div class="ov-tile">
        <span class="ov-num">{totals.checked_in}<span class="ov-of"> / {totals.guests}</span></span>
        <span class="ov-lab">arrived of expected</span>
      </div>
      <div class="ov-tile">
        <span class="ov-num">{totals.parties_arrived}<span class="ov-of"> / {totals.parties}</span></span>
        <span class="ov-lab">parties arrived</span>
      </div>
      <div class="ov-tile">
        <span class="ov-num">{totals.dinner_checked_in}<span class="ov-of"> / {totals.dinner}</span></span>
        <span class="ov-lab">dinner arrived</span>
      </div>
      <div class="ov-tile">
        <span class="ov-num">{totals.late_night_checked_in}<span class="ov-of"> / {totals.late_night}</span></span>
        <span class="ov-lab">late night arrived</span>
      </div>
    </div>

    {#if arrivals5.length}
      <div class="ov-bars" role="img" aria-label="Arrivals per five minutes">
        {#each arrivals5 as b (b.t)}
          <span class="ov-bar" style={`height:${Math.max(4, (Number(b.n) || 0) / maxArrivals * 44)}px`} title={`${b.n} at ${clockTime(b.t)}`}></span>
        {/each}
      </div>
      <p class="ov-hint">Arrivals per 5 minutes</p>
    {/if}

    <div class="ov-tables">
      <div>
        <p class="ov-subhead">By table</p>
        <table class="ov-table">
          <tbody>
            {#each byTable.slice(0, 8) as t (t.table_number ?? "none")}
              <tr><th scope="row">{t.table_number ?? "No table"}</th><td>{t.checked_in} / {t.total}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div>
        <p class="ov-subhead">By ticket type</p>
        <table class="ov-table">
          <tbody>
            {#each byTicketType as t (t.ticket_type)}
              <tr><th scope="row">{t.ticket_type}</th><td>{t.checked_in} / {t.total}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>

  <section class="ov-panel">
    <h2 class="ov-h">Paddles</h2>
    <div class="ov-tiles">
      <div class="ov-tile"><span class="ov-num">{paddles.assigned}</span><span class="ov-lab">assigned</span></div>
      <div class="ov-tile"><span class="ov-num">{paddles.free}</span><span class="ov-lab">free</span></div>
      <div class="ov-tile"><span class="ov-num">{nextFree ?? "–"}</span><span class="ov-lab">next free</span></div>
      <div class="ov-tile" class:ov-tile--warn={paddles.arrived_without_paddle > 0}>
        <span class="ov-num">{paddles.arrived_without_paddle}</span><span class="ov-lab">arrived, no paddle</span>
      </div>
    </div>
  </section>

  <section class="ov-panel">
    <h2 class="ov-h">Money</h2>
    <div class="ov-tiles">
      <div class="ov-tile"><span class="ov-num">{money(moneyTotals.live_cents)}</span><span class="ov-lab">on screen</span></div>
      <div class="ov-tile"><span class="ov-num">{money(moneyTotals.booked_cents)}</span><span class="ov-lab">booked</span></div>
      <div class="ov-tile"><span class="ov-num">{moneyTotals.live_count}</span><span class="ov-lab">gifts</span></div>
      <div class="ov-tile" class:ov-tile--warn={moneyTotals.needs_review > 0}>
        <span class="ov-num">{moneyTotals.needs_review}</span><span class="ov-lab">needs review</span>
      </div>
    </div>
    {#if byLevel.length}
      <div class="ov-levels">
        {#each byLevel as l (l.amount_cents)}
          <div><dt>{money(l.amount_cents)}</dt><dd>{l.paddles} · {money(l.total_cents)}</dd></div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="ov-panel">
    <h2 class="ov-h">Share links</h2>
    <div class="ov-links">
      {#each links as link (link.id)}
        <div class="ov-link">
          {#if qrByUrl[link.url]}
            <img src={qrByUrl[link.url]} alt={`QR code for ${link.label}`} width="120" height="120" />
          {:else}
            <div class="ov-qr-loading">QR</div>
          {/if}
          <div class="ov-link-body">
            <p class="ov-link-label">{link.label}</p>
            <p class="ov-link-url">{link.url}</p>
            <div class="ov-link-actions">
              <button type="button" class="ov-btn" onclick={() => copyLink(link)}>
                {#if copiedId === link.id}<Check size={14} strokeWidth={2.6} /> Copied{:else}<Copy size={14} strokeWidth={2.2} /> Copy link{/if}
              </button>
              <a class="ov-btn ov-btn--ghost" href={link.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} strokeWidth={2.2} /> Open
              </a>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .ov-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
  .ov-panel { background: var(--g26-surface-1); border: 1px solid var(--g26-line); border-radius: var(--g26-r-card); padding: 14px; }
  .ov-h { margin: 0 0 10px; font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: var(--g26-gold-soft); }

  .ov-tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .ov-tile { padding: 10px; background: var(--g26-surface-2); border-radius: var(--g26-r-ctl); border: 1px solid var(--g26-line); }
  .ov-tile--warn { border-color: var(--g26-alert); }
  .ov-num { display: block; font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--g26-cream); }
  .ov-of { font-size: 15px; color: var(--g26-dim); }
  .ov-lab { display: block; margin-top: 2px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--g26-dim); }

  .ov-bars { display: flex; align-items: flex-end; gap: 2px; height: 48px; margin-top: 12px; }
  .ov-bar { flex: 1; min-width: 2px; background: var(--g26-gold-soft); border-radius: 1px; }
  .ov-hint { margin: 4px 0 0; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--g26-dim); }

  .ov-tables { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
  .ov-subhead { margin: 0 0 4px; font-size: 10px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--g26-dim); }
  .ov-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ov-table th, .ov-table td { padding: 3px 0; text-align: left; color: var(--g26-muted); border-bottom: 1px solid var(--g26-line); }
  .ov-table td { text-align: right; font-variant-numeric: tabular-nums; color: var(--g26-cream); }

  .ov-levels { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .ov-levels div { padding: 4px 8px; border: 1px solid var(--g26-line); border-radius: var(--g26-r-ctl); }
  .ov-levels dt { display: inline; font-size: 11px; font-weight: 800; color: var(--g26-gold-soft); }
  .ov-levels dd { display: inline; margin: 0 0 0 4px; font-size: 11px; color: var(--g26-dim); }

  .ov-links { display: flex; flex-direction: column; gap: 10px; }
  .ov-link { display: flex; gap: 10px; padding: 8px; background: var(--g26-surface-2); border-radius: var(--g26-r-ctl); border: 1px solid var(--g26-line); }
  .ov-link img, .ov-qr-loading { flex: none; width: 72px; height: 72px; border-radius: 4px; background: var(--g26-cream); }
  .ov-qr-loading { display: grid; place-items: center; font-size: 10px; color: #999; }
  .ov-link-body { min-width: 0; flex: 1; }
  .ov-link-label { margin: 0; font-size: 13px; font-weight: 800; color: var(--g26-cream); }
  .ov-link-url { margin: 2px 0 6px; font-size: 11px; color: var(--g26-dim); word-break: break-all; }
  .ov-link-actions { display: flex; gap: 6px; }
  .ov-btn {
    display: inline-flex; align-items: center; gap: 5px; min-height: 32px; padding: 0 10px;
    font-size: 11px; font-weight: 800; color: var(--g26-ink); background: var(--g26-gold-soft);
    border: 0; border-radius: var(--g26-r-ctl); cursor: pointer; text-decoration: none;
  }
  .ov-btn--ghost { color: var(--g26-cream); background: transparent; border: 1px solid var(--g26-line-strong); }
</style>
