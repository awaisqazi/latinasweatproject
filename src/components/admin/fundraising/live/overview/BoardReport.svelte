<script>
  // The one-page board report: the goal block, the lately numbers, the
  // needs-attention lines and the four subcommittees with their full update
  // for the month, on Letter portrait. Never visible on screen: the root is
  // moved to <body> and only shows under @media print while the body has
  // the fundraising-printing class, which print() sets and afterprint
  // clears. No donor names or emails are in it, ever: payments are not
  // listed and attention lines print their titles only.
  import { onDestroy, onMount } from "svelte";
  import { formatCentsWhole } from "../../../../../lib/dashboard/fundraisingLive";

  export let view = null; // LiveData's view
  export let bar = null; // goalBarModel() output
  export let lines = []; // attentionLines() output, or [] when hidden
  export let attentionShown = false;
  export let tiles = []; // subcommitteeTiles() output
  export let monthName = "";
  export let todayLabel = "";

  const BODY_CLASS = "fundraising-printing";
  const LINES_PRINTED = 8;
  const UPDATE_PRINTED = 600;
  let root;

  $: totals = view?.totals || {};
  $: ytdCombined = view?.combined?.yearToDate || null;
  $: last12 = view?.combined?.last12Months || null;
  $: rollup = view?.rollup?.status === "ready" ? view.rollup.data : null;
  $: figures = [
    ["Today", totals.today],
    ["Last 7 days", totals.last7Days],
    ["This month", totals.monthToDate],
    ["This year so far", ytdCombined && ytdCombined.grantsCents ? ytdCombined : totals.yearToDate],
  ];
  $: printedLines = lines.slice(0, LINES_PRINTED);

  // The first 600 characters, cut at a word, so the report stays on one page.
  function printedUpdate(body) {
    const flat = String(body || "").trim();
    if (flat.length <= UPDATE_PRINTED) return flat;
    const cut = flat.slice(0, UPDATE_PRINTED);
    const space = cut.lastIndexOf(" ");
    return `${(space > UPDATE_PRINTED * 0.8 ? cut.slice(0, space) : cut).replace(/[\s.,;:]+$/, "")}… continues in the dashboard.`;
  }

  function money(cents) {
    return cents === null || cents === undefined ? "n/a" : formatCentsWhole(cents);
  }

  function clearClass() {
    if (typeof document !== "undefined") document.body.classList.remove(BODY_CLASS);
  }

  export function print() {
    if (typeof window === "undefined") return;
    document.body.classList.add(BODY_CLASS);
    window.addEventListener("afterprint", clearClass, { once: true });
    window.print();
  }

  onMount(() => {
    if (root && root.parentNode !== document.body) document.body.appendChild(root);
  });

  onDestroy(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("afterprint", clearClass);
    clearClass();
    if (root?.parentNode) root.remove();
  });
</script>

<div class="fundraising-print-root" bind:this={root} aria-hidden="true">
  <header class="head">
    <h1>Fundraising board report</h1>
    <p class="muted">Latina Sweat Project{todayLabel ? `, ${todayLabel}` : ""}</p>
  </header>

  <section class="block">
    <h2>{bar ? `${bar.year} goal: ${formatCentsWhole(bar.goalCents)}` : "Goal"}</h2>
    {#if bar}
      <div class="bar">
        <span class="bar-counted" style="width: {bar.countedPercent}%"></span>
        <span class="bar-plans" style="width: {bar.plansPercent}%"></span>
      </div>
      <table class="parts">
        <tbody>
          <tr>
            <th scope="row">{bar.upcoming ? `Grants committed for ${bar.year}` : `Counted in ${bar.year}`}</th>
            <td>{bar.countedKnown ? money(bar.countedCents) : "n/a"}</td>
          </tr>
          {#if bar.plansApply}
            <tr>
              <th scope="row">Rest of the realistic plans</th>
              <td>{bar.sizedCount ? money(bar.plansCents) : "Not sized yet"}</td>
            </tr>
          {/if}
          <tr>
            <th scope="row">Still to find</th>
            <td>{money(bar.gapCents)}</td>
          </tr>
        </tbody>
      </table>
      <p class="lead">{bar.sentence}</p>
      {#if bar.unsizedNote}<p class="muted">{bar.unsizedNote}</p>{/if}
      {#if bar.upcoming && last12}
        <p>
          Last 12 months, the baseline: {money(last12.amountCents)}{last12.grantsCents !== null
            ? ` (${money(last12.zeffyCents)} in Zeffy payments and ${money(last12.grantsCents)} in grants).`
            : " in Zeffy payments."}
        </p>
      {/if}
    {:else}
      <p class="muted">No goal is set yet.</p>
    {/if}
    {#if rollup}
      <table class="plans">
        <thead>
          <tr><th scope="col">Plan by subcommittee</th><th scope="col">Low</th><th scope="col">Realistic</th><th scope="col">Stretch</th></tr>
        </thead>
        <tbody>
          {#each rollup.rows as row (row.id)}
            <tr>
              <th scope="row">{row.tabLabel}</th>
              {#if row.sized}
                <td>{money(row.lowCents)}</td><td>{money(row.realisticCents)}</td><td>{money(row.stretchCents)}</td>
              {:else}
                <td colspan="3">Not sized yet</td>
              {/if}
            </tr>
          {/each}
          {#if rollup.people}
            {#if rollup.people.sized}
              {#each rollup.people.metrics.filter((metric) => metric.sized) as metric (metric.key)}
                <tr>
                  <th scope="row">{rollup.people.tabLabel}: {metric.label.toLowerCase()}</th>
                  <td>{metric.low ?? "n/a"}</td><td>{metric.realistic ?? "n/a"}</td><td>{metric.stretch ?? "n/a"}</td>
                </tr>
              {/each}
            {:else}
              <tr><th scope="row">{rollup.people.tabLabel}, in people</th><td colspan="3">Not sized yet</td></tr>
            {/if}
          {/if}
        </tbody>
      </table>
    {/if}
  </section>

  {#if view?.connected}
    <section class="block">
      <h2>Lately</h2>
      <div class="figures">
        {#each figures as [label, total] (label)}
          <div>
            <p class="muted">{label}</p>
            <p class="figure">{total ? money(total.amountCents) : "n/a"}</p>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  {#if attentionShown}
    <section class="block">
      <h2>Needs attention</h2>
      {#if printedLines.length}
        <ul class="lines">
          {#each printedLines as line (line.key)}
            <li>{line.title}</li>
          {/each}
        </ul>
        {#if lines.length > LINES_PRINTED}
          <p class="muted">And {lines.length - LINES_PRINTED} more on the dashboard.</p>
        {/if}
      {:else}
        <p>Nothing needs attention right now.</p>
      {/if}
    </section>
  {/if}

  <section class="block flow">
    <h2>Subcommittees{monthName ? `, ${monthName} updates` : ""}</h2>
    <div class="tiles">
      {#each tiles as tile (tile.id)}
        <div class="tile">
          <p class="tile-name">{tile.name}</p>
          <p class="muted">{tile.coLeads}</p>
          <p class="tile-number"><strong>{tile.value}</strong> {tile.label}</p>
          <p class="tile-update">{tile.update ? printedUpdate(tile.update.body) : `No update for ${monthName || "this month"} yet.`}</p>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .fundraising-print-root {
    display: none;
  }

  @media print {
    @page {
      size: Letter portrait;
      margin: 0.5in;
    }
    :global(body.fundraising-printing) {
      background: #ffffff !important;
    }
    :global(body.fundraising-printing > *) {
      display: none !important;
    }
    :global(body.fundraising-printing > .fundraising-print-root) {
      display: block !important;
    }
    .fundraising-print-root {
      color: #111111;
      background: #ffffff;
      font-size: 9pt;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    p {
      margin: 0;
    }
    .head {
      margin-bottom: 10pt;
    }
    h1 {
      font-size: 16pt;
      font-weight: 700;
      margin: 0;
    }
    h2 {
      font-size: 11pt;
      font-weight: 700;
      margin: 0 0 4pt;
    }
    .muted {
      color: #555555;
    }
    .block {
      margin-bottom: 11pt;
      break-inside: avoid;
    }
    .flow {
      break-inside: auto;
    }
    .lead {
      font-weight: 600;
      margin-top: 4pt;
    }
    .bar {
      display: flex;
      height: 8pt;
      border-radius: 4pt;
      overflow: hidden;
      background: #e6e6e6;
      margin: 2pt 0 5pt;
    }
    .bar-counted {
      background: #0f766e;
    }
    .bar-plans {
      background: #9fcfca;
    }
    table {
      border-collapse: collapse;
    }
    .parts th,
    .parts td {
      padding: 1pt 10pt 1pt 0;
      text-align: left;
      font-weight: 400;
    }
    .parts td {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .plans {
      width: 100%;
      margin-top: 6pt;
    }
    .plans th,
    .plans td {
      padding: 2pt 0;
      border-top: 0.5pt solid #cccccc;
      text-align: right;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
    }
    .plans thead th {
      border-top: none;
      font-weight: 700;
    }
    .plans th:first-child {
      text-align: left;
    }
    .figures {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8pt;
    }
    .figure {
      font-size: 13pt;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .lines {
      margin: 0;
      padding-left: 12pt;
    }
    .lines li {
      margin: 1pt 0;
    }
    .tiles {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8pt 14pt;
    }
    .tile {
      break-inside: avoid;
    }
    .tile-name {
      font-weight: 700;
    }
    .tile-number {
      margin-top: 2pt;
    }
    .tile-update {
      margin-top: 3pt;
      white-space: pre-line;
    }
  }
</style>
