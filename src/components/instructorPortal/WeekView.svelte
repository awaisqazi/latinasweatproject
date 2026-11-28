<!--
  This week: the current `week` note, the most used actions, what's coming up
  and the everyday links. Which note shows is decided by currentWeek() from the
  README rules; nothing about dates is hard-coded here.
-->
<script>
  import Rich from "./Rich.svelte";
  import Inline from "./Inline.svelte";
  import { currentWeek, visibleDates } from "../../lib/instructorPortal/richText.js";
  import { arr, str, linkAttrs, shortDate, weekday, rangeLabel } from "./text.js";

  let { content, today } = $props();

  const wk = $derived(currentWeek(content?.week, today));
  const entry = $derived(wk.status === "current" || wk.status === "past" ? wk.entry : null);
  const range = $derived(entry ? rangeLabel(entry.start, entry.end) : "");
  const dates = $derived(visibleDates(content?.dates, today));
  const actions = $derived(arr(content?.actions).filter((a) => str(a.label) && linkAttrs(a.href)));
  const links = $derived(arr(content?.links).filter((l) => str(l.label) && linkAttrs(l.href)));
  function whenLine(d) {
    const through = d.end && d.end !== d.date && shortDate(d.end) ? `Through ${shortDate(d.end)}` : "";
    return [through, str(d.time)].filter(Boolean).join(", ");
  }
  const shoutouts = $derived(arr(entry?.shoutouts).filter((s) => typeof s === "string" && s.trim()));
</script>

<section class="ip-view" aria-labelledby="week">
  <div class="ip-weekgrid">
    <div class="ip-weekcol">
      <div class="ip-weekhead">
      {#if entry}
        <p class="ip-kicker">
          {#if wk.status === "current"}This week, {range}{:else}Last week's notes, {range}{/if}
        </p>
        <h1 class="ip-h1" id="week" tabindex="-1">{str(entry.headline) || "This week"}</h1>
        {#if wk.status === "past"}
          <p class="ip-week__aside">
            These notes are from {range}. This week's notes aren't up yet.
          </p>
        {/if}
        <Rich blocks={entry.notes} class="ip-week__notes" level={3} />
        {#if shoutouts.length}
          <div class="ip-shout">
            <h2 class="ip-h3">Shoutouts</h2>
            <ul>
              {#each shoutouts as s}<li><Inline text={s} /></li>{/each}
            </ul>
          </div>
        {/if}
      {:else}
        <h1 class="ip-h1" id="week" tabindex="-1">This week</h1>
        <p class="ip-intro">There's no note for this week yet. What's coming up is below.</p>
      {/if}
      </div>

      <section class="ip-block" id="coming-up" aria-labelledby="coming-up-h">
        <h2 class="ip-h2" id="coming-up-h">Coming up</h2>
        {#if dates.length}
          <ul class="ip-dates">
            {#each dates as d}
              {@const go = linkAttrs(d.href)}
              {@const isToday = d.date === today}
              <li>
                <p class="ip-date">
                  <b>{#if isToday}<span class="ip-mark is-today">{shortDate(d.date)}</span>{:else}{shortDate(d.date)}{/if}</b>
                  <span class:is-today={isToday}>{isToday ? "Today" : weekday(d.date)}</span>
                </p>
                <div>
                  <h3>{str(d.title) || "To be announced"}</h3>
                  {#if whenLine(d)}<p class="ip-muted">{whenLine(d)}</p>{/if}
                  {#if str(d.text)}<p><Inline text={d.text} /></p>{/if}
                  {#if go}<a class="ip-go" {...go}>{str(d.cta) || "Details"}</a>{/if}
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="ip-muted">Nothing on the calendar yet.</p>
        {/if}
      </section>
    </div>

    <div class="ip-weekcol">
      {#if actions.length}
        <section class="ip-block" id="most-used" aria-labelledby="most-used-h">
          <h2 class="ip-h2" id="most-used-h">Most used</h2>
          <ul class="ip-actions">
            {#each actions as a}
              <li>
                <a {...linkAttrs(a.href)}>
                  <b>{a.label}</b>
                  {#if str(a.text)}<span>{a.text}</span>{/if}
                </a>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if links.length}
        <section class="ip-block" id="links" aria-labelledby="links-h">
          <h2 class="ip-h2" id="links-h">Links</h2>
          <ul class="ip-links">
            {#each links as l}
              <li>
                <a class="ip-link" {...linkAttrs(l.href)}>{l.label}</a>
                {#if str(l.text)}<span><Inline text={l.text} /></span>{/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  </div>
</section>
