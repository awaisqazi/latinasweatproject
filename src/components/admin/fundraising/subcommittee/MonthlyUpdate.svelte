<script context="module">
  // Unsaved drafts by "subcommittee|month", so switching tabs mid-sentence
  // keeps the text for this visit.
  const drafts = new Map();
</script>

<script>
  // "This month's update": a short note (up to 2,000 characters) a co-lead
  // writes about how the month went, one per subcommittee per month in
  // fundraising_updates. It saves on its own a moment after typing stops and
  // when the box loses focus, or with Save. The save state is honest: Saving,
  // Saved, or Could not save with Retry, and the text is never thrown away.
  // Last month's update shows collapsed underneath. Hidden when the table is
  // missing or the account cannot read it. The Overview shows these to the
  // whole board.
  import { onDestroy, onMount } from "svelte";
  import {
    UPDATE_MAX_LENGTH,
    currentMonthStart,
    loadUpdates,
    monthName,
    previousMonthStart,
    saveUpdate,
    subscribeTables,
    updatedLabel,
    validateUpdateBody,
  } from "../../../../lib/dashboard/fundraisingUpdates";

  export let supabase;
  export let committeeId = "";
  export let teamMembers = [];
  export let onSaved = () => {};

  const AUTOSAVE_MS = 2500;
  const TICK_MS = 60 * 1000;

  let month = currentMonthStart();
  let lastMonth = previousMonthStart(month);
  let loadStatus = "loading"; // loading | ready | hidden | error
  let current = null;
  let previous = null;
  let draft = "";
  let saveStatus = "idle"; // idle | saving | saved | error
  let saveError = "";
  let validationError = "";
  let autosaveTimer = 0;
  let tickTimer = 0;
  let now = Date.now();
  let destroyed = false;
  let unsubscribe = () => {};
  let saveSeq = 0;
  let pendingSave = false;

  $: draftKey = `${committeeId}|${month}`;
  $: savedBody = current?.body || "";
  $: dirty = draft.trim() !== savedBody.trim();
  $: remaining = UPDATE_MAX_LENGTH - draft.length;
  $: currentYear = Number(month.slice(0, 4));
  $: thisMonthName = monthName(month);
  $: lastMonthName = monthName(lastMonth, currentYear);
  $: membersById = Object.fromEntries((teamMembers || []).map((member) => [member.id, member]));
  $: currentAuthor = current?.authorId ? membersById[current.authorId]?.full_name || membersById[current.authorId]?.email || "" : "";
  $: previousAuthor = previous?.authorId ? membersById[previous.authorId]?.full_name || membersById[previous.authorId]?.email || "" : "";
  $: lastUpdated = current?.updatedAt ? updatedLabel(current.updatedAt, new Date(now)) : "";
  $: textareaId = `fundraising-update-${committeeId}`;
  $: if (draftKey) {
    if (dirty) drafts.set(draftKey, draft);
    else drafts.delete(draftKey);
  }

  onMount(() => {
    load();
    unsubscribe = subscribeTables(
      supabase,
      [{ table: "fundraising_updates", filter: `subcommittee=eq.${committeeId}` }],
      handleRemoteChange,
    );
    tickTimer = window.setInterval(handleTick, TICK_MS);
  });

  onDestroy(() => {
    destroyed = true;
    unsubscribe();
    if (typeof window !== "undefined") {
      window.clearTimeout(autosaveTimer);
      window.clearInterval(tickTimer);
    }
    // Leaving with unsaved words: try once more, the draft stays in memory.
    if (dirty && validateUpdateBody(draft).ok && saveStatus !== "saving") {
      saveUpdate(supabase, { subcommittee: committeeId, month, body: draft }).then(({ error }) => {
        if (!error) drafts.delete(draftKey);
      });
    }
  });

  function handleTick() {
    now = Date.now();
    // A new month started while the page was open: move the box along.
    const fresh = currentMonthStart(new Date(now));
    if (fresh !== month && !dirty) {
      month = fresh;
      lastMonth = previousMonthStart(fresh);
      load();
    }
  }

  async function load() {
    if (!supabase) {
      loadStatus = "hidden";
      return;
    }
    const result = await loadUpdates(supabase, committeeId, [month, lastMonth]);
    if (destroyed) return;
    if (result.missing || result.forbidden) {
      loadStatus = "hidden";
      return;
    }
    if (result.error) {
      loadStatus = current ? "ready" : "error";
      return;
    }
    current = result.rows.find((row) => row.month === month) || null;
    previous = result.rows.find((row) => row.month === lastMonth) || null;
    const stored = drafts.get(`${committeeId}|${month}`);
    draft = stored ?? current?.body ?? "";
    loadStatus = "ready";
  }

  // Someone else saved: take their text unless this box has unsaved words.
  function handleRemoteChange(payload) {
    const row = payload?.new;
    if (!row || row.subcommittee !== committeeId) {
      if (payload?.eventType === "DELETE") load();
      return;
    }
    const monthKey = String(row.month || "").slice(0, 10);
    const normalized = {
      id: row.id,
      subcommittee: row.subcommittee,
      month: monthKey,
      body: row.body || "",
      authorId: row.author_id || "",
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || row.created_at || "",
    };
    if (monthKey === lastMonth) previous = normalized;
    if (monthKey !== month) return;
    const wasDirty = dirty;
    current = normalized;
    // Only replace the text when it really differs (our own save echoes
    // back trimmed, and must not eat a trailing space being typed).
    if (!wasDirty && saveStatus !== "saving" && normalized.body.trim() !== draft.trim()) draft = normalized.body;
  }

  function handleInput() {
    validationError = "";
    if (saveStatus === "saved") saveStatus = "idle";
    window.clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => save(true), AUTOSAVE_MS);
  }

  function handleBlur() {
    if (dirty) save(true);
  }

  async function save(quiet = false) {
    window.clearTimeout(autosaveTimer);
    if (!dirty) return;
    const check = validateUpdateBody(draft);
    if (!check.ok) {
      // Autosave never nags about an empty box; Save does.
      if (!quiet) validationError = check.error;
      return;
    }
    if (saveStatus === "saving") {
      pendingSave = true;
      return;
    }
    const seq = ++saveSeq;
    const body = draft;
    saveStatus = "saving";
    saveError = "";
    validationError = "";
    const { row, error } = await saveUpdate(supabase, { subcommittee: committeeId, month, body });
    if (destroyed || seq !== saveSeq) return;
    if (error) {
      saveStatus = "error";
      saveError = error.code === "client" ? error.message : "Could not save.";
    } else {
      current = row;
      now = Date.now();
      saveStatus = "saved";
      // Typed more while saving: keep the extra words and save them too.
      if (draft.trim() === row.body.trim()) drafts.delete(draftKey);
      onSaved(row);
    }
    if (pendingSave) {
      pendingSave = false;
      if (draft.trim() !== (current?.body || "").trim()) save(true);
    }
  }

  export function focus() {
    document.getElementById(textareaId)?.focus();
  }
</script>

{#if loadStatus !== "hidden"}
  <section class="rounded-card border border-ink/8 bg-white p-4 shadow-card md:p-5" aria-labelledby={`${textareaId}-title`}>
    <h4 id={`${textareaId}-title`} class="text-base font-bold text-ink">This month's update</h4>

    {#if loadStatus === "loading"}
      <p class="mt-2 text-sm text-ink/60">Loading the update.</p>
    {:else if loadStatus === "error"}
      <p class="mt-2 text-sm text-ink/60">The update could not be loaded.</p>
      <button
        type="button"
        class="mt-2 inline-flex min-h-11 items-center rounded-control border border-ink/14 bg-white px-4 text-sm font-semibold text-ink shadow-card hover:border-ink/30"
        onclick={() => {
          loadStatus = "loading";
          load();
        }}
      >
        Try again
      </button>
    {:else}
      <label for={textareaId} class="mt-1 block text-sm text-ink/60">
        How did {thisMonthName} go? What moved, what is stuck, and what you need from the board.
      </label>
      <textarea
        id={textareaId}
        class="input mt-2 min-h-[6.5rem] w-full resize-y py-2.5 leading-6"
        rows="4"
        maxlength={UPDATE_MAX_LENGTH}
        bind:value={draft}
        oninput={handleInput}
        onblur={handleBlur}
        aria-describedby={`${textareaId}-status`}
      ></textarea>

      <div class="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p id={`${textareaId}-status`} class="min-w-0 text-sm text-ink/60" role="status" aria-live="polite">
          {#if validationError}
            <span class="text-red-700">{validationError}</span>
          {:else if saveStatus === "saving"}
            Saving
          {:else if saveStatus === "error"}
            <span class="text-red-700">{saveError} Your text is still here.</span>
          {:else if dirty}
            Not saved yet
          {:else if saveStatus === "saved"}
            Saved{lastUpdated ? `. Last updated ${lastUpdated}${currentAuthor ? ` by ${currentAuthor}` : ""}` : ""}
          {:else if lastUpdated}
            Last updated {lastUpdated}{currentAuthor ? ` by ${currentAuthor}` : ""}
          {:else}
            No update for {thisMonthName} yet
          {/if}
          {#if remaining <= 200}
            <span class="block text-ink/50">{remaining.toLocaleString("en-US")} characters left</span>
          {/if}
        </p>
        {#if saveStatus === "error"}
          <button
            type="button"
            class="inline-flex min-h-11 items-center rounded-control border border-transparent bg-brand px-4 text-sm font-semibold text-ink shadow-card hover:bg-brand-strong"
            onclick={() => save(false)}
          >
            Retry
          </button>
        {:else if dirty}
          <button
            type="button"
            class="inline-flex min-h-11 items-center rounded-control border border-transparent bg-brand px-4 text-sm font-semibold text-ink shadow-card hover:bg-brand-strong disabled:opacity-55"
            disabled={saveStatus === "saving"}
            onclick={() => save(false)}
          >
            Save
          </button>
        {/if}
      </div>

      {#if previous}
        <details class="group mt-3">
          <summary class="flex min-h-11 cursor-pointer list-none items-center text-sm font-semibold text-ink/70 hover:text-ink [&::-webkit-details-marker]:hidden">
            <span class="group-open:hidden">Show the {lastMonthName} update</span>
            <span class="hidden group-open:inline">Hide the {lastMonthName} update</span>
          </summary>
          <div class="rounded-control bg-canvas px-4 py-3">
            <p class="whitespace-pre-line text-sm leading-6 text-ink/80">{previous.body}</p>
            {#if previous.updatedAt}
              <p class="mt-2 text-xs text-ink/50">
                Last updated {updatedLabel(previous.updatedAt, new Date(now))}{previousAuthor ? ` by ${previousAuthor}` : ""}
              </p>
            {/if}
          </div>
        </details>
      {/if}
    {/if}
  </section>
{/if}
