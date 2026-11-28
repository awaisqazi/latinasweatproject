<!--
  Full-screen preview of the instructor portal, drawn with the real portal
  views and stylesheet. The chrome (top bar on phones, a 272 px column from
  1024 px, the width the real sidebar takes) uses the dashboard look; the page
  area uses the portal's. Links never navigate: the dashboard holds unsaved work.

  The portal decides what to show from the date, so a note written for next
  week is invisible "today". `days` lists the days worth looking at (today, then
  the first day of each upcoming note) and the person picks one.
-->
<script>
  import { onMount, tick, untrack } from "svelte";
  import Button from "../ui/Button.svelte";
  import WeekView from "../../instructorPortal/WeekView.svelte";
  import HandbookView from "../../instructorPortal/HandbookView.svelte";
  import { longDate } from "../../instructorPortal/text.js";
  import "../../instructorPortal/portal.css";

  /** days: [{ date: "YYYY-MM-DD", label }], the first one is today. */
  let { content, today, days = [], startDay = "", dirty = false, onclose = () => {} } = $props();

  const VIEWS = [
    { id: "pv-week", label: "This week" },
    { id: "pv-handbook", label: "Handbook and FAQ" },
  ];
  const WEEK_TARGETS = new Set(["week", "coming-up", "most-used", "links"]);

  let dialog = $state(null);
  let pageEl = $state(null);
  let view = $state("pv-week");
  // The day the preview pretends it is. Falls back to today if the picked day
  // is no longer on offer.
  let picked = $state(untrack(() => startDay) || "");
  const day = $derived(days.some((d) => d.date === picked) ? picked : today);
  let query = $state("");
  let openFaq = $state({});
  let linkNote = $state("");
  let noteTimer;

  onMount(() => {
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      clearTimeout(noteTimer);
      if (dialog?.open) dialog.close();
    };
  });

  function handleCancel(event) {
    event.preventDefault();
    onclose();
  }

  function showNote(text) {
    clearTimeout(noteTimer);
    linkNote = text;
    noteTimer = setTimeout(() => (linkNote = ""), 5000);
  }

  function decode(s) {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  }

  function findInPage(id) {
    if (!pageEl || !id) return null;
    return pageEl.querySelector(`[id="${CSS.escape(id)}"]`);
  }

  async function changeView(id) {
    if (id === view) return;
    view = id;
    await tick();
    if (pageEl) pageEl.scrollTop = 0;
  }

  async function goToHash(id) {
    if (/^(faq-|hb-|handbook)/.test(id) || id === "faq" || id === "search") {
      if (view !== "pv-handbook") view = "pv-handbook";
    } else if (WEEK_TARGETS.has(id)) {
      if (view !== "pv-week") view = "pv-week";
    }
    if (id.startsWith("faq-")) openFaq[id.slice(4)] = true;
    await tick();
    // A search hides the full lists; a link to one entry should show it.
    if (!findInPage(id) && query) {
      query = "";
      await tick();
    }
    const target = findInPage(id);
    if (!target) {
      showNote(`Links do not open in the preview. This one goes to #${id}.`);
      return;
    }
    if (target.tagName === "DETAILS") target.open = true;
    target.scrollIntoView({ block: "start" });
  }

  function onPageClick(event) {
    const el = event.target instanceof Element ? event.target.closest("a") : null;
    if (!el || !pageEl?.contains(el)) return;
    event.preventDefault();
    const href = el.getAttribute("href") || "";
    if (href.startsWith("#")) {
      goToHash(decode(href.slice(1)));
    } else if (href) {
      showNote(`Links do not open in the preview. This one goes to ${href}.`);
    }
  }
</script>

<dialog
  bind:this={dialog}
  class="pv-dialog bg-white text-ink"
  aria-label="Portal preview"
  oncancel={handleCancel}
>
  <div class="flex h-full min-h-0 flex-col lg:flex-row">
    <div class="pv-chrome shrink-0 border-b border-ink/8 bg-white px-4 pb-3 lg:w-[272px] lg:border-r lg:border-b-0 lg:px-6 lg:pb-6">
      <div class="flex items-start justify-between gap-3 lg:flex-col lg:items-stretch">
        <div class="min-w-0">
          <h2 class="text-lg font-bold leading-tight text-ink">Preview</h2>
          <p class="mt-0.5 text-sm leading-6 text-ink/60">{dirty ? "Not saved yet." : "This is what is saved."}</p>
        </div>
        <Button variant="secondary" class="shrink-0 max-md:min-h-11 lg:mt-4" onclick={onclose}>Back to editing</Button>
      </div>
      <div class="mt-3 flex gap-1 lg:mt-5 lg:flex-col" role="group" aria-label="Portal page">
        {#each VIEWS as v (v.id)}
          <button
            type="button"
            class="min-h-11 flex-1 rounded-control px-3 text-center text-sm font-semibold transition-colors lg:min-h-10 lg:flex-none lg:text-left {view === v.id
              ? 'bg-ink/[0.07] text-ink'
              : 'text-ink/60 hover:bg-ink/[0.04] hover:text-ink'}"
            aria-pressed={view === v.id}
            onclick={() => changeView(v.id)}>{v.label}</button
          >
        {/each}
      </div>
      {#if days.length > 1 && view === "pv-week"}
        <!-- One row on a phone, so the chrome stays short; stacked in the desktop column. -->
        <div class="mt-3 flex items-center gap-3 lg:mt-5 lg:block">
          <label class="shrink-0 text-sm font-semibold text-ink lg:block" for="pv-day">Show it as of</label>
          <select
            id="pv-day"
            class="select pv-day min-w-0 flex-1 lg:mt-1.5"
            value={day}
            onchange={(event) => (picked = event.currentTarget.value)}
          >
            {#each days as d (d.date)}<option value={d.date}>{d.label}</option>{/each}
          </select>
        </div>
        <p class="mt-1.5 text-xs leading-5 text-ink/50 max-lg:hidden">A note shows from its first day.</p>
      {/if}
      <p class="text-sm leading-6 text-ink/60 {linkNote ? 'mt-2' : ''}" aria-live="polite">{linkNote}</p>
    </div>

    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="pv-page min-h-0 flex-1 overflow-y-auto" bind:this={pageEl} onclickcapture={onPageClick}>
      <div class="ip pv-ip">
        <div class="pv-pad">
          {#if view === "pv-week"}
            <WeekView {content} today={day} />
          {:else}
            <HandbookView {content} bind:query bind:open={openFaq} />
          {/if}
          {#if longDate(content?.updated)}
            <p class="ip-stamp pv-stamp">Portal updated {longDate(content.updated)}.</p>
          {/if}
        </div>
      </div>
    </div>
  </div>
</dialog>

<style>
  .pv-dialog {
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    overflow: hidden;
  }
  .pv-dialog::backdrop {
    background: rgb(30 30 30 / 0.35);
  }
  .pv-chrome {
    padding-top: max(0.75rem, env(safe-area-inset-top));
    padding-left: max(1rem, env(safe-area-inset-left));
    padding-right: max(1rem, env(safe-area-inset-right));
  }
  /* 16 px on phones so iOS does not zoom into the picker. */
  .pv-day {
    min-height: 2.75rem;
    font-size: 1rem;
  }
  .pv-page {
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  /* The portal sets a full-viewport minimum height for its own page. */
  .pv-ip {
    min-height: 100%;
  }
  /* Same padding as the real page (.ip-main), without its fixed tab bar. */
  .pv-pad {
    padding: 16px var(--ip-gutter) calc(56px + env(safe-area-inset-bottom));
    padding-left: max(var(--ip-gutter), env(safe-area-inset-left));
    padding-right: max(var(--ip-gutter), env(safe-area-inset-right));
  }
  /* "Copy link" would copy a dashboard address. Only the buttons: the
     handbook's "Back to the index" link shares the class and stays. */
  .pv-ip :global(button.ip-textbtn) {
    display: none;
  }
  /* The real page hides the stamp on desktop where the sidebar shows it. */
  .pv-ip .pv-stamp {
    display: block;
  }
  @media (min-width: 1024px) {
    .pv-chrome {
      padding-top: 2.25rem;
      padding-left: 1.5rem;
    }
    .pv-pad {
      padding: 64px var(--ip-gutter) 96px 24px;
    }
    .pv-day {
      min-height: 2.5rem;
      font-size: 0.875rem;
    }
  }
</style>
