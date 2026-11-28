<!--
  Dashboard module: edit the instructor portal's weekly note, Coming up dates
  and FAQ answers, preview them in the real portal views, and save with a
  version check so nobody wipes someone else's change.

  Portal content is private. It lives only in memory here: never in
  localStorage, sessionStorage, the URL or the console.
-->
<script module>
  // Unsaved work, kept while the dashboard unmounts this view (another section
  // was opened). Memory only: a reload clears it, which beforeunload warns about.
  let stash = null;
</script>

<script>
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import { ChevronDown, Plus } from "@lucide/svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import ListRows from "./ListRows.svelte";
  import PortalPreview from "./PortalPreview.svelte";
  import { loadPortalForEdit, savePortalEdit, adminReasonText } from "../../../lib/instructorPortal/adminRemote.js";
  import {
    clone,
    sameValue,
    nextWeekRange,
    blankWeek,
    weekStatus,
    portalWeekLine,
    flattenNotes,
    notesAsList,
    blocksToText,
    textToBlocks,
    blankDate,
    isPastDate,
    prepareForSave,
    isDirty,
    rebaseDraft,
    plainProblems,
  } from "../../../lib/instructorPortal/editor.js";
  import { validateContent } from "../../../lib/instructorPortal/schema.js";
  import { chicagoToday, addDays, daysBetween, isDateString } from "../../../lib/instructorPortal/richText.js";
  import { rangeLabel, shortDate, weekday, str, arr } from "../../instructorPortal/text.js";
  import { portalSlug, DEFAULT_SLUG } from "../../../lib/instructorPortal/remote.js";

  // `profile` is part of the module contract; this view does not need it yet.
  let { supabase, profile = null, refreshKey = 0 } = $props();

  const TABS = [
    { id: "ipa-week", label: "This week" },
    { id: "ipa-dates", label: "Dates" },
    { id: "ipa-faq", label: "FAQ" },
  ];
  const SECTION_TAB = { week: "ipa-week", dates: "ipa-dates", faq: "ipa-faq" };
  const SECTION_NAME = { week: "This week", dates: "Dates", faq: "FAQ" };
  const SECTION_ROW = { week: "w", dates: "d", faq: "f" };
  const STATUS_WORDS = { current: "This week", upcoming: "Coming up", past: "Past", invalid: "Check the dates" };
  const ANSWER_HINT =
    "Leave a blank line between paragraphs. Start a line with - for a bullet. Links: [words](https://...). Bold: **words**.";

  const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

  const slug = portalSlug();

  let phase = $state("loading"); // loading | error | ready
  let loadError = $state("");
  let base = $state.raw(null); // the server's document, plain
  let draft = $state(null); // deep working copy, edited in place
  let baseUpdatedAt = $state(""); // opaque version string, passed back untouched
  let updatedBy = $state(null);
  let today = $state(chicagoToday());

  let tab = $state("ipa-week");
  let open = $state({}); // row key -> expanded
  let answers = $state({}); // row key -> FAQ answer text as typed
  let onlyPending = $state(false);
  let saving = $state(false);
  let refreshing = $state(false);
  let notice = $state(null); // { tone, text, retry? }
  let refreshHeld = $state(false);
  let clash = $state(null); // { text, latest }
  let showProblems = $state(false);
  let previewOpen = $state(false);
  let previewStart = $state(""); // the day the preview opens on
  let confirm = $state(null); // { title, message, label, tone, run }
  let problemsEl = $state(null);
  // The pinned save bar. The site's html and body both clip sideways overflow,
  // which stops position: sticky from working anywhere on it, so the bar is
  // fixed and lined up with this view by measuring it. It only shows while the
  // Save button in the header is scrolled out of sight.
  let viewEl = $state(null);
  let actionsEl = $state(null);
  let actionsInView = $state(true);
  let barBox = $state({ left: 0, width: 0 });

  // Stable keys for draft items (their proxies keep their identity until the
  // draft is replaced). Used for row ids, each keys and expanded state.
  const keys = new WeakMap();
  let nextKey = 1;
  function uid(item) {
    if (!item || typeof item !== "object") return 0;
    let k = keys.get(item);
    if (!k) {
      k = nextKey++;
      keys.set(item, k);
    }
    return k;
  }

  // ---- Derived -------------------------------------------------------------
  const snapshot = $derived(draft ? $state.snapshot(draft) : null);
  const dirty = $derived(phase === "ready" && !!base && !!snapshot && isDirty(base, snapshot));
  const prepared = $derived(snapshot ? prepareForSave(snapshot, today) : null);
  const problems = $derived(
    showProblems && prepared ? plainProblems(validateContent(prepared), prepared) : { errors: [], warnings: [] },
  );
  const weekLine = $derived(prepared ? portalWeekLine(prepared.week, today) : "");
  const next = $derived(snapshot ? nextWeekRange(snapshot.week, today) : { start: "", end: "" });
  // Newest first by reversing document order; never sorted while editing.
  const weekRows = $derived(Array.isArray(draft?.week) ? [...draft.week].filter(isObj).reverse() : []);
  const dateRows = $derived(Array.isArray(draft?.dates) ? draft.dates.filter(isObj) : []);
  const pastCount = $derived(dateRows.filter((d) => isPastDate(d, today)).length);
  const faqRows = $derived(Array.isArray(draft?.faq) ? draft.faq.filter(isObj) : []);
  const pendingCount = $derived(faqRows.filter((f) => f.pending === true).length);
  const faqGroups = $derived.by(() => {
    const out = [];
    const byName = new Map();
    for (const f of faqRows) {
      // An open row stays put when its box is unticked, so nothing jumps.
      if (onlyPending && f.pending !== true && !open[uid(f)]) continue;
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
  // What the preview draws, and the days worth looking at: the portal picks a
  // note by date, so one written for next week only shows from its first day.
  const previewDoc = $derived(dirty ? prepared : base);
  const previewDays = $derived.by(() => {
    const out = [{ date: today, label: `Today, ${shortDate(today)}` }];
    for (const w of arr(previewDoc?.week)) {
      if (isObj(w) && weekStatus(w, today) === "upcoming" && !out.some((d) => d.date === w.start)) {
        out.push({ date: w.start, label: `${weekday(w.start)}, ${shortDate(w.start)}` });
      }
    }
    return out;
  });
  const statusLine = $derived.by(() => {
    if (dirty) return "Unsaved changes";
    const when = stamp(baseUpdatedAt);
    if (!when) return "";
    return `Last saved ${when}${updatedBy ? ` by ${updatedBy}` : ""}.`;
  });

  function stamp(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("month")} ${get("day")} at ${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
  }

  function joinAnd(list) {
    if (list.length <= 1) return list[0] || "";
    return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  }

  // ---- Loading -------------------------------------------------------------
  function resetUi() {
    open = {};
    answers = {};
    const current = arr(draft?.week).find((w) => isObj(w) && weekStatus(w, today) === "current");
    if (current) open[uid(current)] = true;
  }

  function setDoc(content, updatedAt, by) {
    const doc = isObj(content) ? content : {};
    base = clone(doc);
    draft = clone(doc);
    baseUpdatedAt = updatedAt;
    updatedBy = by ?? null;
    resetUi();
  }

  let loadSeq = 0;
  async function load() {
    const seq = ++loadSeq;
    if (phase !== "ready") phase = "loading";
    refreshing = true;
    const res = await loadPortalForEdit(supabase, slug);
    if (seq !== loadSeq) return;
    refreshing = false;
    if (!res?.ok) {
      if (phase === "ready") {
        // A refresh failed: keep what is on screen.
        notice = { tone: "error", text: adminReasonText(res?.reason), retry: true };
      } else {
        loadError = adminReasonText(res?.reason);
        phase = "error";
      }
      return;
    }
    today = chicagoToday();
    setDoc(res.content, res.updatedAt, res.updatedBy);
    notice = null;
    clash = null;
    showProblems = false;
    refreshHeld = false;
    const saved = stash;
    stash = null;
    if (saved && saved.slug === slug && saved.baseUpdatedAt === res.updatedAt) {
      draft = clone(saved.draft);
      resetUi();
      notice = { tone: "info", text: "Your unsaved changes are back." };
    }
    phase = "ready";
  }

  onMount(load);

  let seenKey = untrack(() => refreshKey);
  $effect(() => {
    const key = refreshKey;
    untrack(() => {
      if (key === seenKey) return;
      seenKey = key;
      if (dirty) {
        refreshHeld = true;
        return;
      }
      load();
    });
  });

  $effect(() => {
    if (!viewEl || !dirty) return;
    const measure = () => {
      const r = viewEl.getBoundingClientRect();
      barBox = { left: r.left, width: r.width };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewEl);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  });

  $effect(() => {
    if (!actionsEl || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) actionsInView = e.isIntersecting;
    });
    io.observe(actionsEl);
    return () => io.disconnect();
  });

  $effect(() => {
    if (!dirty) return;
    const guard = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  });

  onDestroy(() => {
    if (phase !== "ready" || !base || !draft) return;
    const snap = $state.snapshot(draft);
    stash = isDirty(base, snap) ? { slug, baseUpdatedAt, draft: snap } : null;
  });

  // ---- Saving --------------------------------------------------------------
  async function save() {
    if (saving || !dirty || !draft) return;
    notice = null;
    const out = prepareForSave($state.snapshot(draft), chicagoToday());
    showProblems = true;
    const found = plainProblems(validateContent(out), out);
    if (found.errors.length) {
      await tick();
      problemsEl?.focus();
      return;
    }
    saving = true;
    const res = await savePortalEdit(supabase, slug, out, baseUpdatedAt);
    if (res?.ok) {
      today = chicagoToday();
      setDoc(out, res.updatedAt, "you");
      stash = null;
      clash = null;
      refreshHeld = false;
      notice = {
        tone: "success",
        text: res.unchanged
          ? "Nothing had changed, so nothing was saved."
          : "Saved. Instructors see it the next time they open or reload the portal.",
      };
    } else if (res?.reason === "conflict") {
      await afterConflict();
    } else {
      notice = { tone: "error", text: adminReasonText(res?.reason) };
    }
    saving = false;
  }

  async function afterConflict() {
    const latest = await loadPortalForEdit(supabase, slug);
    if (!latest?.ok) {
      notice = { tone: "error", text: adminReasonText(latest?.reason) };
      return;
    }
    const theirs = isObj(latest.content) ? latest.content : {};
    const who = latest.updatedBy || "Someone else";
    const { doc, clashes } = rebaseDraft(base, $state.snapshot(draft), theirs);
    if (!clashes.length) {
      base = clone(theirs);
      draft = clone(doc);
      baseUpdatedAt = latest.updatedAt;
      updatedBy = latest.updatedBy ?? null;
      resetUi();
      clash = null;
      notice = {
        tone: "warning",
        text: `${who} saved while you were editing. Their changes are loaded and yours are still here. Check them, then save again.`,
      };
      return;
    }
    const names = joinAnd(clashes.map((k) => SECTION_NAME[k] || k));
    clash = {
      latest,
      text: `${who} also changed ${names} and saved first, so your changes were not saved. Your version is still on screen: copy anything you need, then load theirs.`,
    };
  }

  function askLoadTheirs() {
    const latest = clash?.latest;
    if (!latest) return;
    confirm = {
      title: "Load their version?",
      message: "What is on screen is replaced with the version that is saved now. Your changes will be lost.",
      label: "Load their version",
      tone: "danger",
      run: () => {
        setDoc(latest.content, latest.updatedAt, latest.updatedBy);
        clash = null;
        showProblems = false;
        refreshHeld = false;
        notice = { tone: "info", text: "Their version is loaded." };
      },
    };
  }

  function askDiscard() {
    confirm = {
      title: "Discard your changes?",
      message: "This puts back the version that is saved now. Your changes cannot be brought back.",
      label: "Discard changes",
      tone: "danger",
      run: () => {
        draft = clone(base);
        resetUi();
        showProblems = false;
        refreshHeld = false;
        notice = null;
      },
    };
  }

  function runConfirm() {
    const c = confirm;
    confirm = null;
    c?.run();
  }

  // ---- Preview -------------------------------------------------------------
  // Open on today, unless the only weekly note that changed is an upcoming one:
  // then open on its first day, since that is what the person came to check.
  function openPreview() {
    let start = "";
    if (dirty && prepared && base) {
      const before = arr(prepareForSave(base).week);
      const changed = arr(prepared.week).filter((w) => isObj(w) && !before.some((b) => sameValue(b, w)));
      const statuses = changed.map((w) => weekStatus(w, today));
      if (changed.length && !statuses.includes("current")) {
        start = changed.find((w, i) => statuses[i] === "upcoming")?.start ?? "";
      }
    }
    previewStart = start;
    previewOpen = true;
  }

  // ---- Problems ------------------------------------------------------------
  // Problem indexes point into the prepared document, where weeks and dates are
  // sorted. Find the draft item whose cleaned value matches.
  function draftIndexFor(section, index) {
    const list = draft?.[section];
    if (!Array.isArray(list)) return -1;
    if (section === "faq") return index < list.length ? index : -1;
    const preparedList = arr(prepared?.[section]);
    const target = preparedList[index];
    if (target === undefined) return -1;
    let skip = 0;
    for (let i = 0; i < index; i++) if (sameValue(preparedList[i], target)) skip++;
    const snap = $state.snapshot(list);
    for (let j = 0; j < snap.length; j++) {
      const one = prepareForSave({ [section]: [snap[j]] })[section][0];
      if (sameValue(one, target)) {
        if (skip === 0) return j;
        skip--;
      }
    }
    return -1;
  }

  async function openProblem(p) {
    if (!SECTION_TAB[p.section]) return;
    tab = SECTION_TAB[p.section];
    if (p.index === null) return;
    const j = draftIndexFor(p.section, p.index);
    if (j < 0) return;
    const k = uid(draft[p.section][j]);
    open[k] = true;
    await tick();
    const el = document.getElementById(`ipa-${SECTION_ROW[p.section]}-${k}`);
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  }

  // ---- Rows ----------------------------------------------------------------
  function toggle(k) {
    open[k] = !open[k];
  }

  async function focusField(id) {
    await tick();
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: "center" });
    el?.focus({ preventScroll: true });
  }

  function removeFrom(section, entry) {
    const list = draft?.[section];
    if (!Array.isArray(list)) return;
    const i = list.indexOf(entry);
    if (i >= 0) list.splice(i, 1);
  }

  // Week
  function addWeek() {
    if (!draft) return;
    const range = next;
    if (!Array.isArray(draft.week)) draft.week = [];
    draft.week.push(blankWeek(range));
    const k = uid(draft.week[draft.week.length - 1]);
    open[k] = true;
    focusField(`ipa-w-${k}-headline`);
  }

  function setStart(entry, value) {
    const old = entry.start;
    if (isDateString(old) && isDateString(entry.end) && isDateString(value) && daysBetween(old, entry.end) === 6) {
      entry.end = addDays(value, 6);
    }
    entry.start = value;
  }

  function noteItems(entry) {
    const n = entry.notes;
    if (Array.isArray(n) && n.length && n[0]?.t === "ul" && Array.isArray(n[0].items)) return n[0].items;
    return [""];
  }

  function setNoteItems(entry, items) {
    const n = entry.notes;
    if (Array.isArray(n) && n.length === 1 && n[0]?.t === "ul") n[0].items = items;
    else entry.notes = [{ t: "ul", items }];
  }

  function askRemoveWeek(entry) {
    const range = rangeLabel(entry.start, entry.end);
    confirm = {
      title: "Remove this week?",
      message: `The note${range ? ` for ${range}` : ""} comes off the portal when you save.`,
      label: "Remove week",
      tone: "danger",
      run: () => removeFrom("week", entry),
    };
  }

  // Dates
  function addDate() {
    if (!draft) return;
    if (!Array.isArray(draft.dates)) draft.dates = [];
    draft.dates.unshift(blankDate());
    const k = uid(draft.dates[0]);
    open[k] = true;
    focusField(`ipa-d-${k}-date`);
  }

  function askRemoveDate(entry) {
    const name = str(entry.title);
    confirm = {
      title: "Remove this date?",
      message: `${name ? `"${name}"` : "This date"} comes off the portal when you save.`,
      label: "Remove date",
      tone: "danger",
      run: () => removeFrom("dates", entry),
    };
  }

  function askRemovePast() {
    const n = pastCount;
    confirm = {
      title: n === 1 ? "Remove the past date?" : `Remove ${n} past dates?`,
      message:
        n === 1
          ? "It no longer shows on the portal. It is taken out of the list when you save."
          : "They no longer show on the portal. They are taken out of the list when you save.",
      label: n === 1 ? "Remove it" : "Remove them",
      tone: "danger",
      run: () => {
        const list = draft?.dates;
        if (!Array.isArray(list)) return;
        for (let i = list.length - 1; i >= 0; i--) if (isPastDate(list[i], today)) list.splice(i, 1);
      },
    };
  }

  // FAQ
  function answerValue(entry, k) {
    return answers[k] ?? blocksToText(entry.a);
  }

  function setAnswer(entry, k, text) {
    answers[k] = text;
    entry.a = textToBlocks(text);
  }
</script>

{#snippet rowHeader(id, isOpen, onToggle, main, aside, asideTone, sub)}
  <button
    type="button"
    {id}
    class="flex min-h-11 w-full items-start gap-3 py-3 text-left"
    aria-expanded={isOpen}
    aria-controls={isOpen ? `${id}-panel` : undefined}
    onclick={onToggle}
  >
    <span class="min-w-0 flex-1">
      <span class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span class="min-w-0 break-words font-semibold text-ink">{main}</span>
        {#if aside}<span class="text-sm {asideTone === 'bad' ? 'text-red-700' : 'text-ink/60'}">{aside}</span>{/if}
      </span>
      {#if sub}<span class="mt-0.5 block truncate text-sm leading-6 text-ink/60">{sub}</span>{/if}
    </span>
    <ChevronDown
      class="mt-0.5 h-5 w-5 shrink-0 text-ink/45 transition-transform duration-150 {isOpen ? 'rotate-180' : ''}"
      aria-hidden="true"
    />
  </button>
{/snippet}

{#snippet weekRow(entry)}
  {@const k = uid(entry)}
  {@const id = `ipa-w-${k}`}
  {@const status = weekStatus(entry, today)}
  {@const isOpen = !!open[k]}
  <div class="border-t border-ink/8">
    {@render rowHeader(
      id,
      isOpen,
      () => toggle(k),
      rangeLabel(entry.start, entry.end) || "No dates yet",
      STATUS_WORDS[status],
      status === "invalid" ? "bad" : "",
      str(entry.headline),
    )}
    {#if isOpen}
      {@const list = notesAsList(entry.notes)}
      <div id="{id}-panel" class="space-y-5 pb-6 pt-1">
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" id="{id}-start" required>
            <input
              id="{id}-start"
              class="input"
              type="date"
              required
              value={entry.start ?? ""}
              oninput={(event) => setStart(entry, event.currentTarget.value)}
            />
          </Field>
          <Field label="End date" id="{id}-end" required>
            <input
              id="{id}-end"
              class="input"
              type="date"
              required
              min={isDateString(entry.start) ? entry.start : undefined}
              bind:value={entry.end}
            />
          </Field>
        </div>
        <Field label="Headline" id="{id}-headline" hint="The big heading at the top of This week.">
          <input
            id="{id}-headline"
            class="input"
            type="text"
            autocomplete="off"
            placeholder="A few words for the top of the page"
            bind:value={entry.headline}
          />
        </Field>

        {#if list.simple}
          <ListRows bind:items={() => noteItems(entry), (v) => setNoteItems(entry, v)} />
        {:else}
          <div>
            <p class="text-sm font-semibold text-ink">Notes</p>
            <ul class="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-6 text-ink/80">
              {#each list.items as line, i (i)}<li class="break-words">{line}</li>{/each}
            </ul>
            <p class="mt-2 text-sm leading-6 text-ink/60">
              These notes use headings or paragraphs, which this editor cannot change. You can replace them with a plain list.
            </p>
            <Button
              size="sm"
              class="mt-2 max-md:min-h-11"
              onclick={() => (entry.notes = [{ t: "ul", items: flattenNotes($state.snapshot(entry.notes)) }])}
            >
              Replace with a plain list
            </Button>
          </div>
        {/if}

        <ListRows
          title="Shoutouts"
          label="Shoutout"
          addLabel="Add a shoutout"
          hint="One thank-you per box. Bold: **words**."
          bind:items={() => (Array.isArray(entry.shoutouts) ? entry.shoutouts : []), (v) => (entry.shoutouts = v)}
        />

        <div>
          <Button variant="danger" size="sm" class="max-md:min-h-11" onclick={() => askRemoveWeek(entry)}>Remove this week</Button>
        </div>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet dateRow(entry)}
  {@const k = uid(entry)}
  {@const id = `ipa-d-${k}`}
  {@const isOpen = !!open[k]}
  {@const past = isPastDate(entry, today)}
  <div class="border-t border-ink/8">
    {@render rowHeader(
      id,
      isOpen,
      () => toggle(k),
      [shortDate(entry.date) || "No date yet", str(entry.title) || "Untitled"].join(" "),
      past ? "Past, hidden on the portal" : "",
      "",
      "",
    )}
    {#if isOpen}
      <div id="{id}-panel" class="space-y-5 pb-6 pt-1">
        <div class="grid gap-4 sm:grid-cols-2">
          <Field label="Date" id="{id}-date" required>
            <input id="{id}-date" class="input" type="date" required bind:value={entry.date} />
          </Field>
          <Field label="Last day" id="{id}-end" hint="Only for something that runs more than one day.">
            <input
              id="{id}-end"
              class="input"
              type="date"
              min={isDateString(entry.date) ? entry.date : undefined}
              bind:value={entry.end}
            />
          </Field>
        </div>
        <Field label="Time" id="{id}-time" hint="For example 6 pm, or All day.">
          <input id="{id}-time" class="input" type="text" autocomplete="off" bind:value={entry.time} />
        </Field>
        <Field label="Title" id="{id}-title" required>
          <input id="{id}-title" class="input" type="text" autocomplete="off" required bind:value={entry.title} />
        </Field>
        <Field label="Details" id="{id}-text">
          <textarea id="{id}-text" class="textarea details" rows="2" bind:value={entry.text}></textarea>
        </Field>
        <div class="grid gap-4 md:grid-cols-2">
          <Field label="Link" id="{id}-href">
            <input
              id="{id}-href"
              class="input"
              type="text"
              inputmode="url"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              placeholder="/subs/ or https://..."
              bind:value={entry.href}
            />
          </Field>
          <Field label="Link words" id="{id}-cta" hint="What the link says. Blank shows Details.">
            <input id="{id}-cta" class="input" type="text" autocomplete="off" bind:value={entry.cta} />
          </Field>
        </div>
        <div>
          <Button variant="danger" size="sm" class="max-md:min-h-11" onclick={() => askRemoveDate(entry)}>Remove this date</Button>
        </div>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet faqRow(entry)}
  {@const k = uid(entry)}
  {@const id = `ipa-f-${k}`}
  {@const isOpen = !!open[k]}
  <div class="border-t border-ink/8">
    {@render rowHeader(
      id,
      isOpen,
      () => toggle(k),
      str(entry.q) || "Untitled question",
      entry.pending === true ? "Not written yet" : "",
      "",
      "",
    )}
    {#if isOpen}
      <div id="{id}-panel" class="space-y-4 pb-6 pt-1">
        <Field label="Answer" id="{id}-answer" hint={ANSWER_HINT}>
          <textarea
            id="{id}-answer"
            class="textarea answer"
            rows="6"
            value={answerValue(entry, k)}
            oninput={(event) => setAnswer(entry, k, event.currentTarget.value)}
          ></textarea>
        </Field>
        <label class="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm leading-6 text-ink" for="{id}-pending">
          <input
            id="{id}-pending"
            type="checkbox"
            class="mt-1 h-4 w-4 shrink-0 accent-ink"
            checked={entry.pending === true}
            onchange={(event) => (entry.pending = event.currentTarget.checked === true)}
          />
          <span>Not written yet. Instructors see a holding note and who to ask.</span>
        </label>
        {#if str(entry.ask?.who)}
          <p class="text-sm leading-6 text-ink/60">While it is not written, instructors are told to ask {entry.ask.who}.</p>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<section class="ipa space-y-4 {dirty ? 'pb-20' : ''}" aria-labelledby="ipa-title" bind:this={viewEl}>
  <div class="rounded-card border border-ink/8 bg-white p-4 shadow-card md:p-5">
    <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div class="min-w-0">
        <h3 id="ipa-title" class="text-2xl font-bold text-ink">Instructor portal</h3>
        <p class="mt-1 text-sm leading-6 text-ink/60">What instructors see at /instructors. Changes go live when you save.</p>
        {#if phase === "ready" && statusLine}
          <p class="text-sm leading-6 {dirty ? 'font-semibold text-ink' : 'text-ink/60'}">{statusLine}</p>
        {/if}
      </div>
      {#if phase === "ready"}
        <div class="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end" bind:this={actionsEl}>
          {#if dirty}
            <Button variant="ghost" class="max-md:min-h-11" onclick={askDiscard}>Discard changes</Button>
          {/if}
          <Button variant="secondary" class="max-md:min-h-11" onclick={openPreview}>Preview</Button>
          <Button variant="primary" class="max-md:min-h-11" loading={saving} disabled={!dirty} onclick={save}>Save changes</Button>
        </div>
      {/if}
    </div>
    {#if slug !== DEFAULT_SLUG}
      <Banner class="mt-4" tone="warning" message="You are editing the test copy ({slug}), not the real portal." />
    {/if}
  </div>

  {#if phase === "loading"}
    <SkeletonCard lines={5} />
  {:else if phase === "error"}
    <Banner tone="error" message={loadError} onRetry={load} />
  {:else}
    {#if refreshHeld && dirty}
      <Banner
        tone="info"
        message="You have unsaved changes. Save or discard them before refreshing."
        onDismiss={() => (refreshHeld = false)}
      />
    {/if}
    {#if notice}
      <Banner
        tone={notice.tone}
        message={notice.text}
        onRetry={notice.retry ? load : null}
        onDismiss={() => (notice = null)}
      />
    {/if}
    {#if clash}
      <Banner tone="warning">
        <p>{clash.text}</p>
        <div class="mt-2">
          <Button size="sm" class="max-md:min-h-11" onclick={askLoadTheirs}>Load their version</Button>
        </div>
      </Banner>
    {/if}

    {#if problems.errors.length}
      <div bind:this={problemsEl} tabindex="-1" class="outline-none">
        <Banner tone="error">
          <p class="font-semibold">
            {problems.errors.length === 1
              ? "One thing to fix before this can be saved:"
              : `${problems.errors.length} things to fix before this can be saved:`}
          </p>
          <ul class="mt-1.5 space-y-1">
            {#each problems.errors as p, i (i)}
              <li>
                {#if SECTION_TAB[p.section]}
                  <button
                    type="button"
                    class="text-left underline underline-offset-2 hover:no-underline max-md:min-h-11"
                    onclick={() => openProblem(p)}>{p.text}</button
                  >
                {:else}
                  {p.text}
                {/if}
              </li>
            {/each}
          </ul>
        </Banner>
      </div>
    {/if}
    {#if problems.warnings.length}
      <div class="px-1 text-sm leading-6 text-ink/60">
        <p class="font-semibold text-ink">Worth a look:</p>
        <ul class="mt-1 space-y-1">
          {#each problems.warnings as p, i (i)}
            <li>
              <button
                type="button"
                class="text-left underline decoration-ink/30 underline-offset-2 hover:decoration-ink max-md:min-h-11"
                onclick={() => openProblem(p)}>{p.text}</button
              >
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    <Panel loading={refreshing}>
      <Tabs tabs={TABS} bind:active={tab} variant="underline" label="Portal parts" />

      <div id="tabpanel-ipa-week" role="tabpanel" aria-labelledby="tab-ipa-week" hidden={tab !== "ipa-week"} class="pt-5">
        {#if tab === "ipa-week"}
          <p class="text-sm leading-6 text-ink/60">{weekLine}</p>
          {#if next.start}
            <div class="mt-3">
              <Button variant="secondary" icon={Plus} class="max-md:min-h-11 max-sm:w-full" onclick={addWeek}>
                Add the week of {rangeLabel(next.start, next.end)}
              </Button>
            </div>
          {/if}
          {#if weekRows.length}
            <div class="mt-5">
              {#each weekRows as entry (uid(entry))}{@render weekRow(entry)}{/each}
            </div>
          {:else}
            <p class="mt-5 text-sm leading-6 text-ink/60">No weekly notes yet.</p>
          {/if}
        {/if}
      </div>

      <div id="tabpanel-ipa-dates" role="tabpanel" aria-labelledby="tab-ipa-dates" hidden={tab !== "ipa-dates"} class="pt-5">
        {#if tab === "ipa-dates"}
          <p class="text-sm leading-6 text-ink/60">What shows under Coming up. Each date leaves the portal the day after it ends.</p>
          <div class="mt-3">
            <Button variant="secondary" icon={Plus} class="max-md:min-h-11 max-sm:w-full" onclick={addDate}>Add a date</Button>
          </div>
          {#if pastCount}
            <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p class="text-sm leading-6 text-ink/60">
                {pastCount === 1
                  ? "1 date is past and no longer shows on the portal."
                  : `${pastCount} dates are past and no longer show on the portal.`}
              </p>
              <Button variant="ghost" size="sm" class="-ml-2 max-md:min-h-11" onclick={askRemovePast}>Remove past dates</Button>
            </div>
          {/if}
          {#if dateRows.length}
            <div class="mt-5">
              {#each dateRows as entry (uid(entry))}{@render dateRow(entry)}{/each}
            </div>
            <p class="mt-4 border-t border-ink/8 pt-3 text-sm leading-6 text-ink/60">Dates are put in order when you save.</p>
          {:else}
            <p class="mt-5 text-sm leading-6 text-ink/60">Nothing on the calendar yet.</p>
          {/if}
        {/if}
      </div>

      <div id="tabpanel-ipa-faq" role="tabpanel" aria-labelledby="tab-ipa-faq" hidden={tab !== "ipa-faq"} class="pt-5">
        {#if tab === "ipa-faq"}
          {#if faqRows.length}
            <p class="text-sm leading-6 text-ink/60">
              {pendingCount === 0
                ? "Every answer is written."
                : pendingCount === 1
                  ? "1 answer is not written yet."
                  : `${pendingCount} answers are not written yet.`}
            </p>
            {#if pendingCount || onlyPending}
              <label class="mt-1 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-ink" for="ipa-only-pending">
                <input id="ipa-only-pending" type="checkbox" class="h-4 w-4 shrink-0 accent-ink" bind:checked={onlyPending} />
                <span>Only show the ones not written yet</span>
              </label>
            {/if}
            {#each faqGroups as g (g.name)}
              <div class="mt-6">
                <h4 class="pb-1 text-sm font-bold text-ink">{g.name}</h4>
                {#each g.items as entry (uid(entry))}{@render faqRow(entry)}{/each}
              </div>
            {:else}
              <p class="mt-5 text-sm leading-6 text-ink/60">Every answer is written.</p>
            {/each}
          {:else}
            <p class="text-sm leading-6 text-ink/60">No questions yet.</p>
          {/if}
        {/if}
      </div>
    </Panel>

    <p class="px-1 text-sm leading-6 text-ink/60">
      The handbook, contacts and the rest of the portal are read only here for now. You can read them in Preview. To change them, ask the site owner.
    </p>

    {#if dirty && !actionsInView && barBox.width}
      <div
        class="savebar fixed bottom-0 z-20 rounded-t-card border border-b-0 border-ink/10 bg-white px-4 pt-3 shadow-pop"
        style="left: {barBox.left}px; width: {barBox.width}px;"
      >
        <!-- On a phone the two buttons share the row; the words would push Save onto a second line. -->
        <div class="flex items-center justify-end gap-2">
          <p class="mr-auto text-sm font-semibold text-ink max-sm:hidden">Unsaved changes</p>
          <Button variant="secondary" class="max-md:min-h-11 max-sm:flex-1" onclick={openPreview}>Preview</Button>
          <Button variant="primary" class="max-md:min-h-11 max-sm:flex-1" loading={saving} onclick={save}>Save changes</Button>
        </div>
      </div>
    {/if}
  {/if}

  {#if previewOpen && phase === "ready" && base}
    <PortalPreview
      content={previewDoc}
      {today}
      days={previewDays}
      startDay={previewStart}
      {dirty}
      onclose={() => (previewOpen = false)}
    />
  {/if}

  <ConfirmDialog
    open={!!confirm}
    title={confirm?.title ?? ""}
    message={confirm?.message ?? ""}
    confirmLabel={confirm?.label ?? "Confirm"}
    tone={confirm?.tone ?? "danger"}
    onConfirm={runConfirm}
    onCancel={() => (confirm = null)}
  />
</section>

<style>
  /* 16 px controls on phones so iOS does not zoom, 44 px tall; the dashboard
     size from md up. Beats the unlayered .lsp-portal control recipe. */
  .ipa :global(.input),
  .ipa :global(.select) {
    min-height: 2.75rem;
    font-size: 1rem;
  }
  .ipa :global(.textarea) {
    font-size: 1rem;
  }
  .ipa :global([role="tab"]) {
    min-height: 2.75rem;
  }
  /* iOS draws date inputs at a fixed width and centred; keep them in the column. */
  .ipa :global(input[type="date"].input) {
    display: block;
    min-width: 0;
    -webkit-appearance: none;
    appearance: none;
    text-align: left;
  }
  @media (min-width: 768px) {
    .ipa :global(.input),
    .ipa :global(.select) {
      min-height: 2.5rem;
      font-size: 0.875rem;
    }
    .ipa :global(.textarea) {
      font-size: 0.875rem;
    }
    .ipa :global([role="tab"]) {
      min-height: 2.5rem;
    }
  }
  /* The kit's tab strip scrolls sideways when it must, and its active tab
     hangs 1 px below the strip, which also gives it a stray vertical scroll
     bar wherever scroll bars are always shown. Make room for that pixel. */
  .ipa :global([role="tablist"]) {
    overflow-y: hidden;
    padding-bottom: 1px;
  }
  textarea.details {
    min-height: 0;
  }
  textarea.answer {
    field-sizing: content;
    min-height: 9rem;
  }
  .savebar {
    padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  }
</style>
