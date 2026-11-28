<!--
  Onboarding: search, the FAQ grouped by `group`, then the handbook as a
  long-form reader with its own index. Every FAQ entry (#faq-<id>) and handbook
  section (#hb-<id>) has an anchor; InstructorPortalApp opens and scrolls to it.
-->
<script>
  import { onMount } from "svelte";
  import Rich from "./Rich.svelte";
  import Inline from "./Inline.svelte";
  import Ask from "./Ask.svelte";
  import CopyLink from "./CopyLink.svelte";
  import { searchPortal } from "../../lib/instructorPortal/richText.js";
  import { arr, str, linkAttrs, queryWords, snippetFor } from "./text.js";

  let { content, query = $bindable(""), open = $bindable({}) } = $props();

  const handbook = $derived(content?.handbook && typeof content.handbook === "object" ? content.handbook : {});
  const sections = $derived(arr(handbook.sections).filter((s) => str(s.id) && str(s.title)));
  const faq = $derived(arr(content?.faq).filter((f) => str(f.id) && str(f.q)));
  const groups = $derived.by(() => {
    const out = [];
    const byName = new Map();
    for (const f of faq) {
      const name = str(f.group) || "Other questions";
      if (!byName.has(name)) {
        const g = { name, items: [] };
        byName.set(name, g);
        out.push(g);
      }
      byName.get(name).items.push(f);
    }
    return out;
  });
  const versionLine = $derived.by(() => {
    const v = str(handbook.version);
    const e = str(handbook.effective);
    if (v && e) return `Version ${v}, effective ${e}.`;
    if (v) return `Version ${v}.`;
    if (e) return `Effective ${e}.`;
    return "";
  });
  // Everything the holding text says, link targets included, so Ask does not repeat it.
  function answerText(blocks) {
    return JSON.stringify(arr(blocks));
  }
  const original = $derived(linkAttrs(handbook.original?.href));

  const words = $derived(queryWords(query));
  const searching = $derived(words.length > 0);
  const hits = $derived(searching ? searchPortal(content, query) : { faq: [], handbook: [] });
  const faqHits = $derived(faq.filter((f) => hits.faq.includes(f.id)));
  const hbHits = $derived(sections.filter((s) => hits.handbook.includes(s.id)));
  const total = $derived(faqHits.length + hbHits.length);

  // Index: which handbook section is being read (desktop index and phone list).
  let reading = $state("");
  let textEl = $state(null);
  onMount(() => {
    if (!("IntersectionObserver" in window)) return;
    const seen = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = sections.find((s) => seen.get("hb-" + s.id));
        if (first) reading = first.id;
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    let observed = [];
    const watch = () => {
      observed.forEach((el) => io.unobserve(el));
      observed = textEl ? [...textEl.querySelectorAll(".ip-hbsec")] : [];
      observed.forEach((el) => io.observe(el));
    };
    watch();
    const mo = new MutationObserver(watch);
    if (textEl?.parentElement) mo.observe(textEl.parentElement, { childList: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  });

  function clear() {
    query = "";
    document.getElementById("ip-search")?.focus();
  }
</script>

{#snippet faqEntry(f, ws)}
  {#if ws.length}
    <details class="ip-faq" id={"faq-" + f.id} open>{@render faqInner(f, ws)}</details>
  {:else}
    <details class="ip-faq" id={"faq-" + f.id} bind:open={open[f.id]}>{@render faqInner(f, ws)}</details>
  {/if}
{/snippet}

{#snippet faqInner(f, ws)}
    <summary>
      <span><Inline text={f.q} words={ws} /></span>
      <svg viewBox="0 0 22 22" aria-hidden="true"><path d="M11 4v14M4 11h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" /></svg>
    </summary>
    <div class="ip-faq__body">
      {#if f.pending}
        <div class="ip-pending">
          {#if arr(f.a).length}
            <Rich blocks={f.a} words={ws} level={4} />
          {:else}
            <p>This answer is still being written.</p>
          {/if}
        </div>
        <Ask ask={f.ask} skip={answerText(f.a)} />
      {:else}
        <Rich blocks={f.a} words={ws} level={4} />
      {/if}
      <p class="ip-faq__tools">
        {#if str(f.source)}<span class="ip-src">From {f.source}.</span>{/if}<CopyLink id={"faq-" + f.id} label="Copy link to this answer" />
      </p>
    </div>
{/snippet}

<section class="ip-view" aria-labelledby="handbook">
  <div class="ip-hbhead">
    <div>
      <h1 class="ip-h1" id="handbook" tabindex="-1">Handbook and FAQ</h1>
      <p class="ip-intro">Quick answers first, then the full handbook.</p>
    </div>
    <div class="ip-search" role="search" id="search">
      <label class="ip-label" for="ip-search">Search the handbook and FAQ</label>
      <div class="ip-passrow">
        <input
          id="ip-search"
          class="ip-input"
          type="search"
          bind:value={query}
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          enterkeyhint="search"
          aria-describedby="ip-search-status"
        />
        {#if query}<button type="button" class="ip-clear" onclick={clear}>Clear</button>{/if}
      </div>
      <p class="ip-search__hint">Try a word like late, sub or pay.</p>
    </div>
  </div>

  <p class="ip-sr" id="ip-search-status" aria-live="polite">
    {#if searching}{total === 0 ? "No matches" : `${total} ${total === 1 ? "match" : "matches"}`}{/if}
  </p>

  {#if searching}
    <div class="ip-results">
      {#if total === 0}
        <p class="ip-results__count">
          Nothing matches “{query.trim()}”. Try one word, or check <a class="ip-link" href="#contacts">who to contact</a>.
        </p>
      {:else}
        <p class="ip-results__count">{total} {total === 1 ? "match" : "matches"} for “{query.trim()}”</p>
      {/if}

      {#if faqHits.length}
        <section class="ip-block" aria-labelledby="faq-results-h">
          <h2 class="ip-h2" id="faq-results-h">Questions</h2>
          <div>
            {#each faqHits as f (f.id)}{@render faqEntry(f, words)}{/each}
          </div>
        </section>
      {/if}

      {#if hbHits.length}
        <section class="ip-block" aria-labelledby="hb-results-h">
          <h2 class="ip-h2" id="hb-results-h">In the handbook</h2>
          <ul class="ip-hbresults">
            {#each hbHits as s (s.id)}
              {@const snip = snippetFor(s.blocks, words)}
              <li>
                <a class="ip-link" href={"#hb-" + s.id} onclick={() => (query = "")}><Inline text={s.title} {words} /></a>
                {#if snip}<p class="ip-snippet"><Inline text={snip} {words} /></p>{/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}
    </div>
  {:else}
    <section class="ip-block" id="faq" aria-labelledby="faq-h">
      <h2 class="ip-h2" id="faq-h">Questions people ask</h2>
      {#if groups.length}
        <div class="ip-faqgroups">
          {#each groups as g}
            <div class="ip-faqgroup">
              <h3>{g.name}</h3>
              {#each g.items as f (f.id)}{@render faqEntry(f, [])}{/each}
            </div>
          {/each}
        </div>
      {:else}
        <p class="ip-muted">No questions here yet.</p>
      {/if}
    </section>

    <section class="ip-block" id="handbook-text" aria-labelledby="hb-h">
      <h2 class="ip-h2" id="hb-h">{str(handbook.title) || "Instructor handbook"}</h2>
      {#if str(handbook.version) || str(handbook.effective) || str(handbook.appliesTo)}
        <div class="ip-hb__meta">
          {#if versionLine}<p>{versionLine}</p>{/if}
          {#if str(handbook.appliesTo)}<p>Applies to: {handbook.appliesTo}</p>{/if}
        </div>
      {/if}
      {#if str(handbook.note)}<p class="ip-hb__note"><Inline text={handbook.note} /></p>{/if}
      {#if original}
        <p class="ip-hb__orig">
          <a class="ip-go" {...original}>{str(handbook.original?.label) || "Open the original document"}</a>
          {#if str(handbook.original?.access)}<small>{handbook.original.access}</small>{/if}
        </p>
      {/if}

      {#if sections.length}
        <div class="ip-hbwrap" style="margin-top: 36px">
          <div class="ip-hbtext" bind:this={textEl}>
            {#each sections as s (s.id)}
              <section class="ip-hbsec" id={"hb-" + s.id} aria-labelledby={"hb-" + s.id + "-h"}>
                <h3 class="ip-hbsec__title" id={"hb-" + s.id + "-h"}>{s.title}</h3>
                <Rich blocks={s.blocks} level={4} />
                <p class="ip-hbsec__tools">
                  <CopyLink id={"hb-" + s.id} label="Copy link to this section" />
                  <span aria-hidden="true">&nbsp;&nbsp;</span>
                  <a class="ip-textbtn ip-hbtop" href="#handbook-index">Back to the index</a>
                </p>
              </section>
            {/each}
          </div>
          <nav class="ip-hbindex" id="handbook-index" aria-labelledby="hb-index-h">
            <h3 id="hb-index-h">In this handbook</h3>
            <ol>
              {#each sections as s (s.id)}
                <li>
                  <a href={"#hb-" + s.id} aria-current={reading === s.id ? "location" : undefined}><span>{s.title}</span></a>
                </li>
              {/each}
            </ol>
          </nav>
        </div>
      {:else}
        <p class="ip-muted" style="margin-top: 16px">The handbook text isn't here yet.{#if original} Use the original document above.{/if}</p>
      {/if}
    </section>
  {/if}
</section>
