<!--
  Coordinators: the binder's own insert (the view sits on sand). Shift
  schedule, tools, opening and closing checklists, and where to find things.
  `pending` checklists and the find list show their holding note as written.
-->
<script>
  import Rich from "./Rich.svelte";
  import Inline from "./Inline.svelte";
  import { arr, str, linkAttrs } from "./text.js";

  let { content } = $props();

  const co = $derived(content?.coordinators && typeof content.coordinators === "object" ? content.coordinators : {});
  const sched = $derived(co.schedule && typeof co.schedule === "object" ? co.schedule : {});
  const days = $derived(arr(sched.days).map(str).filter(Boolean));
  const rows = $derived(arr(sched.rows).filter((r) => str(r.time)));
  const weekend = $derived(arr(sched.weekend).filter((w) => str(w.day) && (str(w.time) || str(w.who))));
  const weekendDays = $derived.by(() => {
    const out = [];
    for (const w of weekend) {
      let g = out.find((x) => x.day === str(w.day));
      if (!g) out.push((g = { day: str(w.day), shifts: [] }));
      g.shifts.push(w);
    }
    return out;
  });
  // Per-day view of the weekday grid, for phones.
  const byDay = $derived(
    days.map((day, i) => ({
      day,
      shifts: rows.map((r) => ({ time: r.time, who: str(arr(r.who)[i]) })).filter((s) => s.who),
    })),
  );
  const hasSchedule = $derived((days.length && rows.length) || weekend.length);
  const tools = $derived(arr(co.tools).filter((t) => str(t.label) && linkAttrs(t.href)));
  const todos = $derived(arr(co.todos).filter((t) => str(t.title)));
  const find = $derived(co.find && typeof co.find === "object" ? co.find : null);
  const findItems = $derived(arr(find?.items).filter((f) => str(f.what)));
</script>

{#snippet holding(note)}
  <div class="ip-pending">
    {#if str(note)}<p><Inline text={note} /></p>{:else}<p>Still being written. Ask the coordinator on shift for now.</p>{/if}
  </div>
{/snippet}

<section class="ip-view" aria-labelledby="coordinators">
  <h1 class="ip-h1" id="coordinators" tabindex="-1">Coordinators</h1>
  {#if arr(co.intro).length}
    <Rich blocks={co.intro} class="ip-intro" level={2} />
  {/if}

  <section class="ip-block" id="coord-schedule" aria-labelledby="coord-schedule-h">
    <h2 class="ip-h2" id="coord-schedule-h">Shift schedule</h2>
    {#if hasSchedule}
      {#if str(sched.label)}<p class="ip-sched__label" style="margin-top: 6px">{sched.label}</p>{/if}

      {#if days.length && rows.length}
        <table class="ip-table">
          <caption class="ip-sr">Weekday coordinator shifts</caption>
          <thead>
            <tr>
              <th scope="col"><span class="ip-sr">Time</span></th>
              {#each days as d}<th scope="col">{d}</th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each rows as r}
              <tr>
                <th scope="row">{r.time}</th>
                {#each days as _, i}<td>{str(arr(r.who)[i])}</td>{/each}
              </tr>
            {/each}
          </tbody>
        </table>
        <ul class="ip-sched__days is-weekdays">
          {#each byDay as d}
            {#if d.shifts.length}
              <li>
                <h3>{d.day}</h3>
                <dl class="ip-shifts">
                  {#each d.shifts as s}<div><dt>{s.time}</dt><dd>{s.who}</dd></div>{/each}
                </dl>
              </li>
            {/if}
          {/each}
        </ul>
      {/if}

      {#if weekendDays.length}
        <ul class="ip-sched__days ip-sched__weekend">
          {#each weekendDays as d}
            <li>
              <h3>{d.day}</h3>
              <dl class="ip-shifts">
                {#each d.shifts as s}<div><dt>{str(s.time)}</dt><dd>{str(s.who)}</dd></div>{/each}
              </dl>
            </li>
          {/each}
        </ul>
      {/if}
      {#if str(sched.note)}<p class="ip-sched__note"><Inline text={sched.note} /></p>{/if}
    {:else}
      <p class="ip-muted" style="margin-top: 12px">The schedule isn't posted here yet.</p>
    {/if}
  </section>

  <div class="ip-coordgrid">
    <section class="ip-block" id="coord-tools" aria-labelledby="coord-tools-h">
      <h2 class="ip-h2" id="coord-tools-h">Tools</h2>
      {#if tools.length}
        <ul class="ip-tools">
          {#each tools as t}
            <li>
              <a class="ip-link" {...linkAttrs(t.href)}>{t.label}</a>
              {#if str(t.text)}<span><Inline text={t.text} /></span>{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="ip-muted">No tools listed yet.</p>
      {/if}
    </section>

    <div>
      <section class="ip-block" id="coord-todos" aria-labelledby="coord-todos-h">
        <h2 class="ip-h2" id="coord-todos-h">Opening and closing</h2>
        {#if todos.length}
          {#each todos as t}
            {@const items = arr(t.items).filter((x) => typeof x === "string" && x.trim())}
            <div class="ip-todo">
              <h3 class="ip-h3">{t.title}</h3>
              {#if t.pending}{@render holding(t.note)}{:else if str(t.note)}<p class="ip-muted" style="margin-top: 6px"><Inline text={t.note} /></p>{/if}
              {#if items.length}
                {#if t.pending}<p style="margin-top: 12px">What we have so far:</p>{/if}
                <ol>
                  {#each items as it}<li><Inline text={it} /></li>{/each}
                </ol>
              {/if}
            </div>
          {/each}
        {:else}
          <p class="ip-muted">No checklists here yet.</p>
        {/if}
      </section>

      <section class="ip-block" id="coord-find" aria-labelledby="coord-find-h">
        <h2 class="ip-h2" id="coord-find-h">Where to find things</h2>
        {#if find?.pending}{@render holding(find.note)}{:else if str(find?.note)}<p class="ip-muted"><Inline text={find.note} /></p>{/if}
        {#if findItems.length}
          <dl class="ip-find" style="margin-top: 10px">
            {#each findItems as f}<div><dt>{f.what}</dt><dd><Inline text={f.where} /></dd></div>{/each}
          </dl>
        {:else if !find?.pending && !str(find?.note)}
          <p class="ip-muted">Nothing listed yet.</p>
        {/if}
      </section>
    </div>
  </div>
</section>
