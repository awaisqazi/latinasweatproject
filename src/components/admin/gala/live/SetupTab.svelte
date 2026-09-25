<!--
  The Thursday checklist, read-only. Commands are copied verbatim from
  docs/gala-2026/seed/README.md; this tab never runs anything itself, on
  purpose (the seed pipeline has its own safety rails: --i-am-the-organizer,
  a hidden passcode prompt, and a real-event guard that this console must not
  route around).
-->
<script>
  let { event = "gala-2026", checkin = null, standaloneChecklistOnly = false } = $props();

  const health = $derived.by(() => {
    if (!checkin) return null;
    const paddles = Object.values(checkin.paddles || {});
    return {
      guests: checkin.guests.length,
      pool: paddles.length,
      preassigned: paddles.filter((p) => p.preassigned).length,
      assigned: paddles.filter((p) => p.status === "assigned").length,
    };
  });

  const STEPS = [
    {
      title: "1. Set passcodes (owner SQL)",
      body: "Once the seating plan is final, from the SQL editor or the Management API:",
      code: `select public.gala_checkin_set_passcode('${event}', '<door pass>', '<admin pass>');`,
    },
    {
      title: "2. Run the seed",
      body: "From docs/gala-2026/seed (gitignored, local only):",
      code:
        `./fetch-plan.sh ${event} out/plan.json\n` +
        `node build.mjs --zeffy "<zeffy export>.xlsx" --meals "<dinner form>.xlsx" --plan-json out/plan.json\n` +
        `# read out/build-report.txt, then:\n` +
        `GALA_ADMIN_PASSCODE='...' node apply.mjs --event ${event} --guests out/guests.json --headroom 60 --i-am-the-organizer`,
    },
    {
      title: "3. Print the paper pack",
      body: "The offline fallback for every desk:",
      code: `node paper-pack.mjs --event ${event} --out out/paper-pack.html`,
    },
    {
      title: "4. Take a snapshot",
      body: "Read-only backup, safe to run any time, worth repeating during the night:",
      code: `./snapshot.sh ${event}`,
    },
  ];
</script>

<div class="st-wrap">
  {#if !standaloneChecklistOnly}
    <h2 class="st-h">Thursday checklist</h2>
  {/if}
  <ol class="st-steps">
    {#each STEPS as step (step.title)}
      <li>
        <p class="st-title">{step.title}</p>
        <p class="st-body">{step.body}</p>
        <pre class="st-code">{step.code}</pre>
      </li>
    {/each}
  </ol>

  {#if !standaloneChecklistOnly}
    <section class="st-health">
      <h2 class="st-h">Current event health</h2>
      {#if health}
        <div class="st-tiles">
          <div><span class="st-num">{health.guests}</span><span class="st-lab">guests loaded</span></div>
          <div><span class="st-num">{health.pool}</span><span class="st-lab">paddles in the pool</span></div>
          <div><span class="st-num">{health.preassigned}</span><span class="st-lab">preassigned</span></div>
          <div><span class="st-num">{health.assigned}</span><span class="st-lab">currently assigned</span></div>
        </div>
      {:else}
        <p class="st-body">Not connected yet.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .st-wrap { display: flex; flex-direction: column; gap: 16px; max-width: 760px; }
  .st-h { margin: 0; font-size: 11px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: var(--g26-gold-soft); }
  .st-steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 14px; }
  .st-steps li::marker { color: var(--g26-gold-soft); font-weight: 800; }
  .st-title { margin: 0; font-size: 14px; font-weight: 800; color: var(--g26-cream); }
  .st-body { margin: 3px 0 6px; font-size: 12.5px; color: var(--g26-dim); }
  .st-code {
    margin: 0; padding: 10px 12px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px;
    line-height: 1.5; white-space: pre-wrap; word-break: break-word;
    color: var(--g26-gold-hi); background: var(--g26-surface-2); border: 1px solid var(--g26-line);
    border-radius: var(--g26-r-ctl);
  }

  .st-health { padding-top: 8px; border-top: 1px solid var(--g26-line); }
  .st-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 8px; }
  .st-tiles div { padding: 10px; background: var(--g26-surface-2); border: 1px solid var(--g26-line); border-radius: var(--g26-r-ctl); }
  .st-num { display: block; font-size: 20px; font-weight: 800; color: var(--g26-cream); font-variant-numeric: tabular-nums; }
  .st-lab { display: block; margin-top: 2px; font-size: 11px; color: var(--g26-dim); }
</style>
