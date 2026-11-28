<!--
  Instructor portal app: session, gate, shell and hash routing.

  Contract: src/lib/instructorPortal/README.md. Content arrives only from
  unlockPortal / resumePortal (or, under astro dev with ?local=1, from the
  gitignored working copy) and is kept in memory.

  Routing is the URL hash, so every section, FAQ answer (#faq-<id>) and
  handbook section (#hb-<id>) can be texted as a link, and Back walks back
  through what was opened. The views:
    #week         This week (also #coming-up, #most-used, #links)
    #handbook     Handbook and FAQ (also #faq, #search, #faq-*, #hb-*, #handbook-*)
    #contacts     Who to contact (also #contact-*)
    #involved     Get involved (also #volunteer, #committees, #fundraising)
    #coordinators Coordinators (also #coord-*)
-->
<script>
  import { onMount, tick } from "svelte";
  import "./portal.css";
  import PortalGate from "./PortalGate.svelte";
  import WeekView from "./WeekView.svelte";
  import HandbookView from "./HandbookView.svelte";
  import ContactsView from "./ContactsView.svelte";
  import InvolvedView from "./InvolvedView.svelte";
  import CoordinatorsView from "./CoordinatorsView.svelte";
  import { resumePortal, lockPortal, loadLocalContent, localMode } from "../../lib/instructorPortal/remote.js";
  import { chicagoToday } from "../../lib/instructorPortal/richText.js";
  import { longDate } from "./text.js";

  const VIEWS = [
    { id: "week", label: "This week", short: "This\nweek" },
    { id: "handbook", label: "Handbook and FAQ", short: "Handbook" },
    { id: "contacts", label: "Who to contact", short: "Contacts" },
    { id: "involved", label: "Get involved", short: "Get\ninvolved" },
    { id: "coordinators", label: "Coordinators", short: "Coordinators", apart: true },
  ];
  const ALIASES = {
    "coming-up": "week",
    "most-used": "week",
    links: "week",
    faq: "handbook",
    search: "handbook",
    volunteer: "involved",
    committees: "involved",
    fundraising: "involved",
  };

  /** boot | gate | open */
  let phase = $state("boot");
  let content = $state(null);
  let notice = $state("");
  let view = $state("week");
  let query = $state("");
  let openFaq = $state({});
  let today = $state(chicagoToday());

  function viewFor(hash) {
    const h = hash.replace(/^#/, "");
    if (!h) return "week";
    if (VIEWS.some((v) => v.id === h)) return h;
    if (ALIASES[h]) return ALIASES[h];
    if (/^(faq-|hb-|handbook-)/.test(h)) return "handbook";
    if (h.startsWith("contact-")) return "contacts";
    if (h.startsWith("coord")) return "coordinators";
    return "week";
  }

  function decode(h) {
    try {
      return decodeURIComponent(h);
    } catch {
      return h;
    }
  }

  /** Show the view for the current hash and bring its target into view. */
  async function route({ focus = true } = {}) {
    const hash = decode(location.hash.replace(/^#/, ""));
    const next = viewFor(hash);
    const changed = next !== view;
    view = next;

    if (hash.startsWith("faq-")) openFaq[hash.slice(4)] = true;
    if (hash.startsWith("hb-") || hash.startsWith("faq-") || hash === "handbook-index") {
      // A search hides the full list; a link to one entry should show it.
      if (query && !document.getElementById(hash)) query = "";
    }
    await tick();

    const isViewTop = !hash || VIEWS.some((v) => v.id === hash);
    const target = isViewTop ? null : document.getElementById(hash);
    if (target) {
      target.scrollIntoView({ block: "start" });
      if (focus && hash.startsWith("faq-")) target.querySelector("summary")?.focus({ preventScroll: true });
    } else if (changed || isViewTop) {
      window.scrollTo(0, 0);
      // Put focus on the new view's heading so screen readers hear where they are.
      if (focus && changed) document.getElementById(next)?.focus({ preventScroll: true });
    }
  }

  // Same-hash taps (the link you are already on) do not fire hashchange.
  function onClick(event) {
    const a = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
    if (!a || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (a.getAttribute("href") === location.hash) {
      event.preventDefault();
      route();
    }
  }

  async function open(res) {
    content = res.content && typeof res.content === "object" ? res.content : {};
    notice = "";
    today = chicagoToday();
    phase = "open";
    await tick();
    route({ focus: false });
  }

  async function lock() {
    content = null;
    query = "";
    openFaq = {};
    phase = "gate";
    notice = "Locked on this device. Enter the passcode to open it again.";
    // Leave the address clean so the next person starts at the top.
    history.replaceState(history.state, "", location.pathname + location.search);
    await lockPortal();
  }

  onMount(() => {
    // Browsers restore scroll on Back by themselves; this app manages it.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const onHash = () => route();
    window.addEventListener("hashchange", onHash);

    (async () => {
      if (import.meta.env.DEV && localMode()) {
        const res = await loadLocalContent();
        if (res.ok) return open(res);
      }
      const res = await resumePortal();
      if (res.ok) return open(res);
      if (res.reason === "expired") notice = "Your session ended. Enter the passcode to open the portal again.";
      phase = "gate";
    })();

    // A portal left open in a tab overnight should roll over to the new day.
    const timer = setInterval(() => (today = chicagoToday()), 60000);
    return () => {
      window.removeEventListener("hashchange", onHash);
      clearInterval(timer);
    };
  });

  const updated = $derived(content?.updated ? longDate(content.updated) : "");
</script>

<svelte:window onclick={onClick} />

<div class="ip" class:is-coord={phase === "open" && view === "coordinators"}>
  {#if phase === "boot"}
    <p class="ip-boot" role="status">Opening the instructor portal…</p>
  {:else if phase === "gate"}
    <PortalGate {notice} onunlock={open} />
  {:else}
    <header class="ip-top">
      <a class="ip-top__home" href="#week">
        <img src="/images/lsp-studio-logo.png" width="40" height="40" alt="" />
        <span>Instructor portal</span>
      </a>
      <button type="button" class="ip-lock" onclick={lock}>Lock</button>
    </header>

    <aside class="ip-side" aria-label="Instructor portal">
      <a class="ip-side__home" href="#week"><img src="/images/lsp-studio-logo.png" width="96" height="96" alt="The Latina Sweat Project" /></a>
      <p class="ip-side__title">Instructor portal</p>
      <nav aria-label="Sections">
        <ul>
          {#each VIEWS as v}
            <li class:is-apart={v.apart}>
              {#if v.apart}<p class="ip-side__note">For studio coordinators</p>{/if}
              <a href={"#" + v.id} aria-current={view === v.id ? "page" : undefined}><span>{v.label}</span></a>
            </li>
          {/each}
        </ul>
      </nav>
      <div class="ip-side__foot">
        {#if updated}<p>Updated {updated}</p>{/if}
        <button type="button" class="ip-lock" onclick={lock}>Lock this device</button>
      </div>
    </aside>

    <main class="ip-main" id="ip-main">
      {#if view === "week"}
        <WeekView {content} {today} />
      {:else if view === "handbook"}
        <HandbookView {content} bind:query bind:open={openFaq} />
      {:else if view === "contacts"}
        <ContactsView {content} />
      {:else if view === "involved"}
        <InvolvedView {content} {today} />
      {:else}
        <CoordinatorsView {content} />
      {/if}
      {#if updated}<p class="ip-stamp">Portal updated {updated}.</p>{/if}
    </main>

    <nav class="ip-tabs" aria-label="Sections">
      <ul>
        {#each VIEWS as v}
          <li>
            <a href={"#" + v.id} aria-current={view === v.id ? "page" : undefined}><span>{v.short}</span></a>
          </li>
        {/each}
      </ul>
    </nav>
  {/if}
</div>
