<script>
    // Live "what are you bringing" board for /friendsgiving. Same mechanics as
    // PotluckApp.svelte (Supabase table + token RPCs + Realtime), its own look.
    // Svelte legacy mode: `$:` statements read state directly and pass it into
    // the pure helpers from src/data/friendsgiving.js (state read inside a
    // helper is not tracked).
    import { onMount, onDestroy, tick } from "svelte";
    import { supabase, SUPABASE_CONFIG_ERROR } from "../lib/supabaseClient.js";
    import {
        friendsgivingEvent as EVENT,
        friendsgivingCourses as COURSES,
        friendsgivingDietaryTags as TAGS,
        friendsgivingIdeas as IDEAS,
        findRepeats,
        openIdeas,
    } from "../data/friendsgiving.js";

    const EVENT_SLUG = EVENT.slug;
    const NAME_KEY = "lsp-friendsgiving-name";
    const ITEM_TOKENS_KEY = "lsp-friendsgiving-item-tokens";
    const CHANNEL_NAME = "friendsgiving-live";
    const POLL_MS = 10000;
    const SELECT_COLS =
        "id, event_slug, contributor_name, item_name, category, dietary_tags, notes, created_at";

    // Dev-only fixture (?demo=1). `import.meta.env.DEV` is a literal false in
    // production builds, so this branch and its sample data are dropped.
    let demo = false;

    // Live data
    let items = [];
    let loading = true;
    let loadError = "";
    let live = false;
    let everLive = false; // first connect reads "Connecting", later drops "Reconnecting"

    let myItemTokens = {};

    // Form
    let formName = "";
    let formItem = "";
    let formCategory = "";
    let formTags = [];
    let formNotes = "";
    let editingId = null;
    let submitting = false;
    let submitError = "";
    let raceIds = []; // repeats that appeared between typing and pressing
    let flash = "";
    let highlightId = null;

    let formSection;
    let nameInput;
    let itemInput;
    let formVisible = false;
    let formHeight = 0; // feeds the desktop sticky offset (see .fg-side)

    let channel = null;
    let resubscribing = false;
    let destroyed = false;
    let refetchTimer = null;
    let pollTimer = null;
    let flashTimer = null;
    let highlightTimer = null;
    let observer = null;
    let writeSeq = 0; // bumps on every local write; stale refetches are dropped

    const RPC_TIMEOUT = { __timedOut: true };
    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((resolve) => setTimeout(() => resolve(RPC_TIMEOUT), ms)),
        ]);
    }

    function readStorage(key, fallback) {
        try {
            const raw = window.localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function writeStorage(key, value) {
        if (demo) return;
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Private mode: entries still post, they just won't be editable
            // after a reload.
        }
    }

    function byCreated(a, b) {
        return String(a.created_at).localeCompare(String(b.created_at));
    }

    // ---- Loading ----

    async function fetchItems() {
        let result;
        try {
            result = await withTimeout(
                supabase
                    .from("potluck_items")
                    .select(SELECT_COLS)
                    .eq("event_slug", EVENT_SLUG)
                    .order("created_at", { ascending: true }),
                10000,
            );
        } catch (err) {
            result = { error: err };
        }
        if (result === RPC_TIMEOUT) return { ok: false, timedOut: true };
        if (result.error) {
            console.error("Friendsgiving load error:", result.error?.message);
            return { ok: false };
        }
        return { ok: true, data: result.data ?? [] };
    }

    async function loadInitial() {
        if (demo) return;
        if (!supabase) {
            loading = false;
            loadError = SUPABASE_CONFIG_ERROR || "unavailable";
            return;
        }
        const res = await fetchItems();
        if (res.ok) {
            items = res.data;
            loadError = "";
        } else if (items.length === 0) {
            loadError = res.timedOut
                ? "The menu is taking too long to load."
                : "We couldn't load the menu.";
        }
        loading = false;
    }

    // Background refresh: never blanks the board. A failure keeps the list
    // we already have; a result that started before a local write is
    // discarded and retried so it can't undo an optimistic update.
    async function refreshItems() {
        if (demo || !supabase) return false;
        const seq = writeSeq;
        const res = await fetchItems();
        if (destroyed) return false;
        if (!res.ok) return false;
        if (seq !== writeSeq) {
            scheduleRefetch();
            return false;
        }
        items = res.data;
        if (loadError) {
            loadError = "";
            loading = false;
        }
        return true;
    }

    function scheduleRefetch() {
        if (refetchTimer) clearTimeout(refetchTimer);
        refetchTimer = setTimeout(refreshItems, 250);
    }

    // ---- Realtime ----

    function upsertRow(list, row) {
        const clean = {
            id: row.id,
            event_slug: row.event_slug,
            contributor_name: row.contributor_name,
            item_name: row.item_name,
            category: row.category,
            dietary_tags: row.dietary_tags || [],
            notes: row.notes,
            created_at: row.created_at,
        };
        const exists = list.some((i) => i.id === row.id);
        const next = exists
            ? list.map((i) => (i.id === row.id ? clean : i))
            : [...list, clean];
        return next.sort(byCreated);
    }

    // Apply each change instantly, then reconcile with a debounced refetch.
    // The table subscription stays unfiltered: filtered subscriptions drop
    // DELETE events (their payload only carries the primary key).
    function handleChange(payload) {
        const type = payload?.eventType;
        if (type === "DELETE") {
            const id = payload.old?.id;
            if (id) items = items.filter((i) => i.id !== id);
        } else if (type === "INSERT" || type === "UPDATE") {
            const row = payload.new;
            if (!row || row.event_slug !== EVENT_SLUG) return;
            items = upsertRow(items, row);
        } else {
            return;
        }
        // A refetch already in flight predates this event; counting the event
        // as a write makes that stale result get dropped instead of briefly
        // undoing what we just applied.
        writeSeq += 1;
        scheduleRefetch();
    }

    function startPolling() {
        if (pollTimer || demo || destroyed) return;
        pollTimer = setInterval(() => {
            if (document.visibilityState === "visible") refreshItems();
        }, POLL_MS);
    }

    function stopPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
    }

    function subscribe() {
        if (!supabase || demo || destroyed || channel) return;
        const ch = supabase.channel(CHANNEL_NAME);
        channel = ch;
        ch.on(
            "postgres_changes",
            { event: "*", schema: "public", table: "potluck_items" },
            handleChange,
        ).subscribe((status) => {
            // Callbacks from a channel we've already replaced (including the
            // CLOSED that our own removeChannel fires) are ignored, so a
            // teardown can never trigger another resubscribe.
            if (ch !== channel || destroyed) return;
            if (status === "SUBSCRIBED") {
                live = true;
                everLive = true;
                stopPolling();
                // Catch anything that happened while we were not joined.
                refreshItems();
            } else {
                live = false;
                startPolling();
            }
        });
    }

    async function resubscribe() {
        if (resubscribing || destroyed || demo || !supabase) return;
        resubscribing = true;
        const old = channel;
        channel = null;
        live = false;
        startPolling();
        if (old) {
            try {
                await supabase.removeChannel(old);
            } catch {
                // Already gone; nothing to clean up.
            }
        }
        resubscribing = false;
        subscribe();
    }

    // Phones and in-app browsers suspend background tabs and drop the socket.
    // Whenever the page comes back, refetch and rejoin if needed.
    function wake() {
        if (destroyed || demo || !supabase) return;
        if (document.visibilityState === "hidden") return;
        refreshItems();
        const state = channel?.state;
        if (!live && state !== "joining") resubscribe();
    }

    function onVisibility() {
        if (document.visibilityState === "visible") wake();
    }

    // ---- Lifecycle ----

    onMount(() => {
        if (import.meta.env.DEV) {
            const params = new URLSearchParams(window.location.search);
            if (params.get("demo") === "1") {
                demo = true;
                const t0 = Date.parse("2026-11-10T15:00:00Z");
                const at = (m) => new Date(t0 + m * 60000).toISOString();
                const row = (id, contributor_name, item_name, category, m, extra = {}) => ({
                    id,
                    event_slug: EVENT_SLUG,
                    contributor_name,
                    item_name,
                    category,
                    dietary_tags: [],
                    notes: null,
                    created_at: at(m),
                    ...extra,
                });
                items = [
                    row("d1", "Maria G.", "Mac and cheese", "side", 1),
                    row("d2", "Yesenia", "Smoked turkey", "main", 2, {
                        notes: "Already carved, bringing it warm.",
                    }),
                    row("d3", "Ana", "Pumpkin pie", "dessert", 3, {
                        dietary_tags: ["vegetarian"],
                    }),
                    row("d4", "Guadalupe Hernández-Villanueva", "Sweet potato casserole with toasted marshmallows", "side", 4, {
                        dietary_tags: ["vegetarian", "contains-nuts"],
                        notes: "Pecan crumble on half of it.",
                    }),
                    row("d5", "Liz", "Cranberry sauce", "side", 5, {
                        dietary_tags: ["vegan", "gluten-free"],
                    }),
                    row("d6", "Karla", "Sparkling cider", "drink", 6),
                    row("d7", "Fez", "Plates and napkins", "supplies", 7),
                    row("d8", "Dani", "Green bean casserole", "side", 8),
                    row("d9", "Rosa", "Tres leches cake", "dessert", 9),
                    row("d10", "Paola", "Spinach artichoke dip", "appetizer", 10, {
                        dietary_tags: ["vegetarian"],
                    }),
                    row("d11", "Marisol", "Agua de jamaica", "drink", 11),
                    row("d12", "Bianca", "Cornbread", "side", 12),
                    row("d13", "Vero", "Pozole rojo", "main", 13, {
                        dietary_tags: ["spicy"],
                    }),
                    row("d14", "Itzel", "Cups and ice", "supplies", 14),
                ];
                myItemTokens = { d5: "demo", d12: "demo" };
                formName = "Liz";
                loading = false;
            }
        }

        if (!demo) {
            myItemTokens = readStorage(ITEM_TOKENS_KEY, {});
            formName = readStorage(NAME_KEY, "");
            loadInitial();
            if (supabase) {
                startPolling();
                subscribe();
            }
            document.addEventListener("visibilitychange", onVisibility);
            window.addEventListener("pageshow", wake);
            window.addEventListener("online", wake);
            window.addEventListener("focus", wake);
        }

        if (formSection && "IntersectionObserver" in window) {
            observer = new IntersectionObserver(
                (entries) => {
                    formVisible = entries.some((e) => e.isIntersecting);
                },
                { threshold: 0.08 },
            );
            observer.observe(formSection);
        }
    });

    onDestroy(() => {
        destroyed = true;
        if (channel && supabase) supabase.removeChannel(channel);
        channel = null;
        stopPolling();
        for (const t of [refetchTimer, flashTimer, highlightTimer]) {
            if (t) clearTimeout(t);
        }
        observer?.disconnect();
        if (typeof window !== "undefined") {
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pageshow", wake);
            window.removeEventListener("online", wake);
            window.removeEventListener("focus", wake);
        }
    });

    // ---- Derived state ----

    $: menu = COURSES.map((c) => ({
        ...c,
        list: items.filter((i) => i.category === c.id),
    })).filter((c) => c.alwaysShow || c.list.length > 0);

    $: ideasLeft = openIdeas(IDEAS, items);

    $: ideasByCourse = ideasLeft.reduce((acc, idea) => {
        (acc[idea.category] ||= []).push(idea);
        return acc;
    }, {});

    $: repeats = findRepeats(formItem, formCategory, items, editingId, COURSES);

    $: tagLabels = TAGS.reduce((acc, t) => {
        acc[t.id] = t.label;
        return acc;
    }, {});

    $: showTags = formCategory !== "supplies";

    $: submitLabel = submitting
        ? "Saving…"
        : editingId
          ? repeats.length
              ? "Save it anyway"
              : "Save changes"
          : repeats.length
            ? "Add it anyway"
            : "Add to the menu";

    $: liveLabel = demo
        ? "Preview"
        : live
          ? "Live"
          : everLive
            ? "Reconnecting"
            : "Connecting";

    function metaLine(item, labels) {
        const tags = (item.dietary_tags || [])
            .map((t) => labels[t])
            .filter(Boolean);
        const tagText = tags.length
            ? tags
                  .map((t, i) => (i === 0 ? t : t.toLowerCase()))
                  .join(", ")
            : "";
        const note = String(item.notes ?? "").trim();
        if (tagText && note) return `${tagText}. ${note}`;
        return tagText || note;
    }

    // ---- Actions ----

    function showFlash(message) {
        flash = message;
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => (flash = ""), 5000);
    }

    function reducedMotion() {
        return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    }

    function scrollToForm(focusField = true) {
        formSection?.scrollIntoView({
            behavior: reducedMotion() ? "auto" : "smooth",
            block: "start",
        });
        if (!focusField) return;
        const target = String(formName ?? "").trim() ? itemInput : nameInput;
        setTimeout(() => target?.focus({ preventScroll: true }), 350);
    }

    async function bringIntoView(id) {
        highlightId = id;
        await tick();
        document.getElementById(`fg-item-${id}`)?.scrollIntoView({
            behavior: reducedMotion() ? "auto" : "smooth",
            block: "center",
        });
        if (highlightTimer) clearTimeout(highlightTimer);
        highlightTimer = setTimeout(() => (highlightId = null), 2800);
    }

    function pickIdea(idea) {
        editingId = null;
        formItem = idea.label;
        formCategory = idea.category;
        formTags = [];
        formNotes = "";
        submitError = "";
        raceIds = [];
        scrollToForm();
    }

    function toggleTag(id) {
        formTags = formTags.includes(id)
            ? formTags.filter((t) => t !== id)
            : [...formTags, id];
    }

    function startEdit(item) {
        editingId = item.id;
        formName = item.contributor_name;
        formItem = item.item_name;
        formCategory = item.category;
        formTags = [...(item.dietary_tags || [])];
        formNotes = item.notes || "";
        submitError = "";
        raceIds = [];
        scrollToForm(false);
    }

    function resetForm() {
        editingId = null;
        formItem = "";
        formCategory = "";
        formTags = [];
        formNotes = "";
        submitError = "";
        raceIds = [];
    }

    async function submitItem() {
        submitError = "";
        const name = String(formName ?? "").trim();
        const itemName = String(formItem ?? "").trim();
        const notes = String(formNotes ?? "").trim();

        if (!name) {
            submitError = "Add your name so people know who to thank.";
            return;
        }
        if (!itemName) {
            submitError = "Tell us what you're bringing.";
            return;
        }
        if (!formCategory) {
            submitError = "Pick a course for it.";
            return;
        }

        submitting = true;

        // Race check: what the person can see right now counts as seen.
        // Refetch, and if a new look-alike appeared since, show it and stop;
        // the next press goes through.
        const seen = new Set([...repeats.map((r) => r.id), ...raceIds]);
        if (!demo) await refreshItems();
        const fresh = findRepeats(itemName, formCategory, items, editingId, COURSES);
        const unseen = fresh.filter((r) => !seen.has(r.id));
        if (unseen.length > 0) {
            raceIds = [...raceIds, ...unseen.map((r) => r.id)];
            submitting = false;
            submitError = `${unseen[0].contributor_name} just added ${unseen[0].item_name}. Press again if you still want to add yours.`;
            return;
        }

        const tags = showTags ? formTags : [];
        const wasEditing = editingId;

        try {
            if (demo) {
                const id = wasEditing || `demo-${Date.now()}`;
                if (wasEditing) {
                    items = items.map((i) =>
                        i.id === id
                            ? { ...i, contributor_name: name, item_name: itemName, category: formCategory, dietary_tags: tags, notes: notes || null }
                            : i,
                    );
                } else {
                    myItemTokens = { ...myItemTokens, [id]: "demo" };
                    items = upsertRow(items, {
                        id,
                        event_slug: EVENT_SLUG,
                        contributor_name: name,
                        item_name: itemName,
                        category: formCategory,
                        dietary_tags: tags,
                        notes: notes || null,
                        created_at: new Date().toISOString(),
                    });
                }
                submitting = false;
                afterSave(name, itemName, id, wasEditing);
                return;
            }

            const args = wasEditing
                ? {
                      p_item_id: wasEditing,
                      p_token: myItemTokens[wasEditing],
                      p_contributor_name: name,
                      p_item_name: itemName,
                      p_category: formCategory,
                      p_serves: null,
                      p_dietary_tags: tags,
                      p_notes: notes || null,
                  }
                : {
                      p_event_slug: EVENT_SLUG,
                      p_contributor_name: name,
                      p_item_name: itemName,
                      p_category: formCategory,
                      p_serves: null,
                      p_dietary_tags: tags,
                      p_notes: notes || null,
                  };

            let result;
            try {
                result = await withTimeout(
                    supabase.rpc(
                        wasEditing ? "potluck_update_item" : "potluck_add_item",
                        args,
                    ),
                    12000,
                );
            } catch (err) {
                result = { error: err };
            }
            submitting = false;

            if (result === RPC_TIMEOUT) {
                submitError = "That took too long. Please try again.";
                return;
            }
            if (result.error) {
                console.error("Friendsgiving submit error:", result.error?.message);
                submitError = "That didn't save. Please try again.";
                return;
            }
            const data = result.data;
            if (!data?.ok) {
                submitError =
                    data?.reason === "event_full"
                        ? "The menu is full. Reach out to the LSP team."
                        : data?.reason === "not_found"
                          ? "This entry can only be changed from the phone or browser it was added on."
                          : "Please double-check your entry and try again.";
                return;
            }

            writeSeq += 1;
            if (wasEditing) {
                items = items.map((i) =>
                    i.id === wasEditing
                        ? { ...i, contributor_name: name, item_name: itemName, category: formCategory, dietary_tags: tags, notes: notes || null }
                        : i,
                );
            } else {
                myItemTokens = { ...myItemTokens, [data.id]: data.token };
                writeStorage(ITEM_TOKENS_KEY, myItemTokens);
                // upsertRow dedupes by id, so a Realtime echo of this insert
                // that lands first (or after) never makes a second line.
                items = upsertRow(items, {
                    id: data.id,
                    event_slug: EVENT_SLUG,
                    contributor_name: name,
                    item_name: itemName,
                    category: formCategory,
                    dietary_tags: tags,
                    notes: notes || null,
                    created_at: new Date().toISOString(),
                });
            }
            scheduleRefetch();
            afterSave(name, itemName, wasEditing || data.id, wasEditing);
        } catch (err) {
            submitting = false;
            console.error("Friendsgiving submit error:", err);
            submitError = "That didn't save. Please try again.";
        }
    }

    function afterSave(name, itemName, id, wasEditing) {
        writeStorage(NAME_KEY, name);
        showFlash(
            wasEditing
                ? `Saved. ${itemName} is updated on the menu.`
                : `Thank you, ${name}. ${itemName} is on the menu.`,
        );
        resetForm();
        bringIntoView(id);
    }

    async function removeItem(item) {
        const sure = window.confirm(`Take ${item.item_name} off the menu?`);
        if (!sure) return;

        if (demo) {
            items = items.filter((i) => i.id !== item.id);
            if (editingId === item.id) resetForm();
            showFlash(`${item.item_name} is off the menu.`);
            return;
        }

        let result;
        try {
            result = await withTimeout(
                supabase.rpc("potluck_remove_item", {
                    p_item_id: item.id,
                    p_token: myItemTokens[item.id],
                }),
                12000,
            );
        } catch (err) {
            result = { error: err };
        }

        if (result === RPC_TIMEOUT || result?.error || !result?.data?.ok) {
            showFlash("That didn't come off the menu. Please try again.");
            return;
        }

        writeSeq += 1;
        items = items.filter((i) => i.id !== item.id);
        const { [item.id]: _removed, ...rest } = myItemTokens;
        myItemTokens = rest;
        writeStorage(ITEM_TOKENS_KEY, myItemTokens);
        if (editingId === item.id) resetForm();
        showFlash(`${item.item_name} is off the menu.`);
        scheduleRefetch();
    }

    function retry() {
        loading = true;
        loadError = "";
        loadInitial();
        if (!live) resubscribe();
    }
</script>

<!-- Shared leaf art: gradients, a watercolor edge filter, two leaf shapes. -->
<svg class="fg-defs" aria-hidden="true" focusable="false" width="0" height="0">
    <defs>
        <filter id="fg-wc" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="5" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation="0.45" result="b" />
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="grain" />
            <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.55 1.12" result="g2" />
            <feComposite in="b" in2="g2" operator="in" />
        </filter>
        <radialGradient id="fg-g-orange" cx="40%" cy="38%" r="70%">
            <stop offset="0" stop-color="#f0a24a" />
            <stop offset="0.55" stop-color="#d8601f" />
            <stop offset="1" stop-color="#a83e14" />
        </radialGradient>
        <radialGradient id="fg-g-red" cx="45%" cy="40%" r="70%">
            <stop offset="0" stop-color="#cf5a37" />
            <stop offset="0.6" stop-color="#a3301c" />
            <stop offset="1" stop-color="#6e1c10" />
        </radialGradient>
        <radialGradient id="fg-g-gold" cx="40%" cy="35%" r="70%">
            <stop offset="0" stop-color="#f6cf6a" />
            <stop offset="0.55" stop-color="#e0a030" />
            <stop offset="1" stop-color="#b77418" />
        </radialGradient>
        <radialGradient id="fg-g-olive" cx="40%" cy="40%" r="70%">
            <stop offset="0" stop-color="#b9b25a" />
            <stop offset="0.6" stop-color="#8b8a2f" />
            <stop offset="1" stop-color="#5d5c1c" />
        </radialGradient>
        <symbol id="fg-maple" viewBox="0 0 100 100">
            <path
                d="M50 78 L36 83 L38 74 L19 70 L26 62 L7 48 L18 45 L13 31 L28 37 L30 25 L40 33 L41 13 L50 3 L59 13 L60 33 L70 25 L72 37 L87 31 L82 45 L93 48 L74 62 L81 70 L62 74 L64 83 Z"
                stroke-linejoin="round"
            />
            <path d="M50 78 L52 97" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            <path d="M50 78 L50 14 M50 60 L22 44 M50 60 L78 44 M50 70 L28 66 M50 70 L72 66" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.45" />
        </symbol>
        <symbol id="fg-oak" viewBox="0 0 100 50">
            <path d="M4 25 C 20 4, 58 0, 96 25 C 58 50, 20 46, 4 25 Z" />
            <path d="M0 25 L 90 25 M30 25 L44 13 M30 25 L44 37 M52 25 L66 14 M52 25 L66 36" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.45" />
        </symbol>
    </defs>
</svg>

<div class="fg-app">
    <div class="fg-topline">
        <p class="fg-kicker">{EVENT.kicker}</p>
        <p class="fg-live" class:is-live={live && !demo} aria-live="polite">
            <span class="fg-live-dot" aria-hidden="true"></span>
            {liveLabel}
        </p>
    </div>

    <div class="fg-layout">
        <!-- The menu card -->
        <article class="fg-paper" aria-labelledby="fg-title">
            <header class="fg-masthead">
                <div class="fg-leaves" aria-hidden="true">
                    <svg class="leaf l1" viewBox="0 0 100 100"><g filter="url(#fg-wc)" fill="url(#fg-g-orange)" color="#7a2c0c"><use href="#fg-maple" /></g></svg>
                    <svg class="leaf l2" viewBox="0 0 100 50"><g filter="url(#fg-wc)" fill="url(#fg-g-olive)" color="#4a4912"><use href="#fg-oak" /></g></svg>
                    <svg class="leaf l3" viewBox="0 0 100 100"><g filter="url(#fg-wc)" fill="url(#fg-g-gold)" color="#8a5410"><use href="#fg-maple" /></g></svg>
                    <svg class="leaf l4" viewBox="0 0 100 50"><g filter="url(#fg-wc)" fill="url(#fg-g-red)" color="#5a140a"><use href="#fg-oak" /></g></svg>
                    <svg class="leaf l5" viewBox="0 0 100 100"><g filter="url(#fg-wc)" fill="url(#fg-g-red)" color="#5a140a"><use href="#fg-maple" /></g></svg>
                </div>
                <h1 id="fg-title" class="fg-script">
                    <span class="sr-only">{EVENT.kicker}: </span>Friendsgiving
                </h1>
                <p class="fg-caps">Celebrate the season</p>
                <p class="fg-when">
                    {EVENT.dateLabel}<br />{EVENT.timeLabel}
                </p>
                <p class="fg-lede">{EVENT.instruction}</p>
            </header>

            {#if loading}
                <p class="fg-status">Setting the table…</p>
            {:else if loadError}
                <div class="fg-status">
                    <p>
                        {loadError === SUPABASE_CONFIG_ERROR || loadError === "unavailable"
                            ? "The menu isn't available right now. Please try again later."
                            : `${loadError} Please try again.`}
                    </p>
                    {#if supabase}
                        <button type="button" class="fg-textbtn" on:click={retry}>Try again</button>
                    {/if}
                </div>
            {:else}
                <div class="fg-courses">
                    {#each menu as course (course.id)}
                        <section class="fg-course" aria-labelledby={`fg-c-${course.id}`}>
                            <h2 id={`fg-c-${course.id}`}>{course.label}</h2>
                            {#if course.list.length > 0}
                                <ul>
                                    {#each course.list as item (item.id)}
                                        {@const meta = metaLine(item, tagLabels)}
                                        <li
                                            id={`fg-item-${item.id}`}
                                            class="fg-dish"
                                            class:is-new={highlightId === item.id}
                                            class:is-editing={editingId === item.id}
                                        >
                                            <p class="fg-line">
                                                <span class="fg-name">{item.item_name}</span>
                                                <span class="fg-by">{item.contributor_name}</span>
                                            </p>
                                            {#if meta}
                                                <p class="fg-meta">{meta}</p>
                                            {/if}
                                            {#if myItemTokens[item.id]}
                                                <p class="fg-mine">
                                                    <span>Yours</span>
                                                    <button type="button" on:click={() => startEdit(item)}>Edit</button>
                                                    <button type="button" on:click={() => removeItem(item)}>Remove</button>
                                                </p>
                                            {/if}
                                        </li>
                                    {/each}
                                </ul>
                            {:else}
                                <p class="fg-empty">Nobody yet.</p>
                            {/if}
                            {#if ideasByCourse[course.id]?.length}
                                <p class="fg-ideas">
                                    <span class="fg-ideas-lead">{course.list.length ? "More ideas:" : "Ideas:"}</span>
                                    {#each ideasByCourse[course.id] as idea, i (idea.label)}<button
                                            type="button"
                                            on:click={() => pickIdea(idea)}
                                            aria-label={`Bring ${idea.label}`}>{idea.label}</button
                                        >{i < ideasByCourse[course.id].length - 1 ? ", " : ""}{/each}
                                </p>
                            {/if}
                        </section>
                    {/each}
                </div>
            {/if}
        </article>

        <!-- Form + tips, on the dark ground -->
        <div class="fg-side" bind:clientHeight={formHeight} style={`--fg-form-h: ${formHeight}px`}>
            <section
                class="fg-form"
                bind:this={formSection}
                id="fg-add"
                aria-labelledby="fg-form-title"
            >
                <h2 id="fg-form-title">
                    {editingId ? "Change your dish" : "What are you bringing?"}
                </h2>
                <p class="fg-form-sub">
                    {editingId
                        ? "Save and the menu updates for everyone."
                        : "It shows up on the menu for everyone right away."}
                </p>

                <form on:submit|preventDefault={submitItem} novalidate>
                    <div class="fg-field">
                        <label for="fg-name">Your name</label>
                        <input
                            id="fg-name"
                            type="text"
                            bind:this={nameInput}
                            bind:value={formName}
                            maxlength="80"
                            autocomplete="name"
                            autocapitalize="words"
                            placeholder="Maria G."
                        />
                    </div>

                    <div class="fg-field">
                        <label for="fg-item">What you're bringing</label>
                        <input
                            id="fg-item"
                            type="text"
                            bind:this={itemInput}
                            bind:value={formItem}
                            maxlength="120"
                            autocomplete="off"
                            autocapitalize="sentences"
                            placeholder="Sweet potato casserole"
                            aria-describedby={repeats.length ? "fg-repeat" : undefined}
                        />
                    </div>

                    {#if repeats.length > 0}
                        <div class="fg-repeat" id="fg-repeat" role="status">
                            {#each repeats.slice(0, 2) as r (r.id)}
                                <p><strong>{r.contributor_name}</strong> is already bringing {r.item_name}.</p>
                            {/each}
                            {#if repeats.length > 2}
                                <p>And {repeats.length - 2} more like it.</p>
                            {/if}
                            <p class="fg-repeat-hint">We're aiming for no repeats, so something different is best. You can still add it if you mean to.</p>
                        </div>
                    {/if}

                    <div class="fg-field">
                        <label for="fg-course">Course</label>
                        <div class="fg-select">
                            <select id="fg-course" bind:value={formCategory}>
                                <option value="" disabled>Choose one</option>
                                {#each COURSES as c (c.id)}
                                    <option value={c.id}>{c.label}</option>
                                {/each}
                            </select>
                        </div>
                    </div>

                    {#if showTags}
                        <fieldset class="fg-field fg-tags">
                            <legend>Good to know <span>(optional)</span></legend>
                            <div class="fg-tag-grid">
                                {#each TAGS as tag (tag.id)}
                                    <label class="fg-check">
                                        <input
                                            type="checkbox"
                                            checked={formTags.includes(tag.id)}
                                            on:change={() => toggleTag(tag.id)}
                                        />
                                        <span class="fg-box" aria-hidden="true"></span>
                                        {tag.label}
                                    </label>
                                {/each}
                            </div>
                        </fieldset>
                    {/if}

                    <div class="fg-field">
                        <label for="fg-notes">A short note <span>(optional)</span></label>
                        <textarea
                            id="fg-notes"
                            bind:value={formNotes}
                            maxlength="280"
                            rows="2"
                            placeholder="Abuela's recipe, made with pecans"
                        ></textarea>
                    </div>

                    {#if submitError}
                        <p class="fg-error" role="alert">{submitError}</p>
                    {/if}

                    <button type="submit" class="fg-submit" disabled={submitting}>
                        {submitLabel}
                    </button>
                    {#if editingId}
                        <button type="button" class="fg-textbtn fg-cancel" on:click={resetForm}>
                            Cancel
                        </button>
                    {/if}

                    <p class="fg-fine">
                        You can change or remove your dish later from this same phone and browser.
                    </p>
                </form>
            </section>
        </div>
    </div>

    <!-- Closing notes: under the form on phones, a full-width row on desktop.
         Kept outside .fg-layout on purpose: a sticky grid item is held by
         the whole grid, so inside it the form would slide over these. -->
    <section class="fg-tips" aria-labelledby="fg-tips-title">
        <h2 id="fg-tips-title">A few small things</h2>
        <div class="fg-tips-list">
            <p>Label anything with common allergens, like nuts, dairy or gluten.</p>
            <p>Bring a serving spoon or tongs for your dish.</p>
            <p>Store-bought counts just as much as homemade.</p>
        </div>
        <a class="fg-back" href={EVENT.partifulUrl} rel="noopener">Back to the invite on Partiful</a>
    </section>
</div>

<!-- Phone-only sticky action -->
<div class="fg-bar" class:is-hidden={formVisible || loading}>
    <button type="button" on:click={() => scrollToForm()}>Add your dish</button>
</div>

<div class="fg-toast" aria-live="polite">
    {#if flash}
        <p>{flash}</p>
    {/if}
</div>

<style>
    .fg-defs {
        position: absolute;
        width: 0;
        height: 0;
        overflow: hidden;
    }

    .fg-app {
        position: relative;
        z-index: 1;
        margin: 0 auto;
        max-width: 1120px;
        padding: 20px 14px 0;
    }

    /* Top line on the dark ground */
    .fg-topline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 0 4px 14px;
        font-family: "Rubik", sans-serif;
        color: var(--fg-cream);
    }
    .fg-kicker {
        font-weight: 600;
        font-size: 15px;
        letter-spacing: 0.02em;
    }
    .fg-live {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        font-size: 14px;
        color: color-mix(in srgb, var(--fg-cream) 72%, transparent);
    }
    .fg-live-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--fg-cream) 45%, transparent);
    }
    .fg-live.is-live {
        color: var(--fg-cream);
    }
    .fg-live.is-live .fg-live-dot {
        background: var(--fg-firefly);
        box-shadow:
            0 0 6px 2px color-mix(in srgb, var(--fg-firefly) 70%, transparent),
            0 0 16px 6px color-mix(in srgb, var(--fg-firefly) 25%, transparent);
        animation: fg-pulse 2.6s ease-in-out infinite;
    }
    @keyframes fg-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.45; transform: scale(0.8); }
    }

    /* Layout */
    .fg-layout {
        display: grid;
        gap: 44px;
    }
    @media (min-width: 1024px) {
        .fg-app {
            padding: 36px 32px 0;
        }
        .fg-topline {
            margin-bottom: 18px;
        }
        .fg-layout {
            grid-template-columns: minmax(0, 1fr) 384px;
            gap: 56px;
            align-items: start;
        }
        /* The form follows the menu down the page. It parks under the fixed
           header; if the window is shorter than the form, it rides up
           instead so the submit button is always in view. Very short
           windows get a plain, non-sticky form. */
        .fg-side {
            position: sticky;
            top: min(96px, calc(100vh - var(--fg-form-h, 700px) - 20px));
        }
    }
    @media (min-width: 1024px) and (max-height: 699px) {
        .fg-side {
            position: static;
        }
    }

    /* The paper menu card */
    .fg-paper {
        position: relative;
        background-color: var(--fg-paper);
        background-image:
            radial-gradient(120% 80% at 50% 0%, rgba(255, 252, 244, 0.7), transparent 60%),
            radial-gradient(140% 120% at 50% 50%, transparent 62%, rgba(120, 82, 40, 0.14) 100%),
            url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.35 0 0 0 0 0.25 0 0 0 0 0.15 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E");
        color: var(--fg-ink);
        border-radius: 3px;
        padding: 30px 22px 40px;
        box-shadow:
            0 1px 0 rgba(255, 255, 255, 0.4) inset,
            0 28px 70px -18px rgba(0, 0, 0, 0.75),
            0 0 90px -10px color-mix(in srgb, var(--fg-firefly) 12%, transparent);
    }
    @media (min-width: 640px) {
        .fg-paper {
            padding: 44px 56px 56px;
        }
    }
    @media (min-width: 1024px) {
        .fg-paper {
            padding: 52px 72px 64px;
        }
    }

    .fg-masthead {
        position: relative;
        text-align: center;
        padding-top: 18px;
    }
    .fg-leaves {
        position: absolute;
        inset: 0 0 auto 0;
        height: 150px;
        pointer-events: none;
    }
    .leaf {
        position: absolute;
        overflow: visible;
        mix-blend-mode: multiply;
    }
    .l1 { width: 62px; left: calc(50% - 168px); top: -10px; transform: rotate(-24deg); }
    .l2 { width: 52px; left: calc(50% - 150px); top: 64px; transform: rotate(32deg); }
    .l3 { width: 50px; left: calc(50% + 112px); top: -16px; transform: rotate(28deg); }
    .l4 { width: 46px; left: calc(50% + 120px); top: 62px; transform: rotate(-38deg); }
    .l5 { width: 24px; left: calc(50% + 86px); top: 30px; transform: rotate(-12deg); opacity: 0.8; }
    @media (min-width: 640px) {
        .l1 { width: 82px; left: calc(50% - 250px); top: -14px; }
        .l2 { width: 66px; left: calc(50% - 222px); top: 78px; }
        .l3 { width: 66px; left: calc(50% + 172px); top: -22px; }
        .l4 { width: 58px; left: calc(50% + 184px); top: 74px; }
        .l5 { width: 30px; left: calc(50% + 140px); top: 34px; }
    }

    .fg-script {
        position: relative;
        font-family: "Pinyon Script", "Fraunces", cursive;
        font-weight: 400;
        font-size: 58px;
        line-height: 1.15;
        color: var(--fg-bronze);
        margin: 0;
    }
    @media (min-width: 640px) {
        .fg-script {
            font-size: 84px;
        }
    }
    .fg-caps {
        margin-top: 4px;
        font-family: "Fraunces", serif;
        font-size: 11px;
        font-weight: 560;
        letter-spacing: 0.32em;
        text-transform: uppercase;
        color: var(--fg-bronze);
    }
    .fg-when {
        margin-top: 18px;
        font-family: "Fraunces", serif;
        font-style: italic;
        font-size: 19px;
        line-height: 1.4;
    }
    .fg-lede {
        margin: 14px auto 0;
        max-width: 30ch;
        font-family: "Fraunces", serif;
        font-size: 16.5px;
        line-height: 1.55;
        color: color-mix(in srgb, var(--fg-ink) 80%, transparent);
    }
    @media (min-width: 640px) {
        .fg-when { font-size: 21px; }
        .fg-lede { max-width: 38ch; font-size: 17.5px; }
    }

    .fg-status {
        margin-top: 40px;
        text-align: center;
        font-family: "Fraunces", serif;
        font-style: italic;
        font-size: 17px;
    }

    /* Courses */
    .fg-courses {
        margin: 36px auto 0;
        max-width: 560px;
    }
    .fg-course + .fg-course {
        margin-top: 34px;
    }
    .fg-course h2 {
        font-family: "Fraunces", serif;
        font-style: italic;
        font-weight: 560;
        font-size: 25px;
        line-height: 1.2;
        text-align: center;
        color: var(--fg-ink);
        margin-bottom: 10px;
    }
    .fg-course ul {
        list-style: none;
        margin: 0;
        padding: 0;
    }
    .fg-dish {
        position: relative;
        padding: 7px 0;
        border-radius: 4px;
        transition: background-color 1.2s ease;
    }
    .fg-dish.is-new {
        animation: fg-glow 2.8s ease-out;
    }
    .fg-dish.is-editing .fg-name {
        text-decoration: underline;
        text-decoration-thickness: 1px;
        text-underline-offset: 4px;
    }
    @keyframes fg-glow {
        0% { background-color: color-mix(in srgb, var(--fg-leaf-gold) 38%, transparent); box-shadow: 0 0 0 8px color-mix(in srgb, var(--fg-leaf-gold) 38%, transparent); }
        100% { background-color: transparent; box-shadow: 0 0 0 8px transparent; }
    }
    .fg-line {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 18px;
        font-family: "Fraunces", serif;
    }
    .fg-name {
        font-size: 18.5px;
        line-height: 1.35;
        font-weight: 450;
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .fg-by {
        flex: 0 1 auto;
        max-width: 44%;
        text-align: right;
        font-style: italic;
        font-size: 16.5px;
        line-height: 1.35;
        color: color-mix(in srgb, var(--fg-ink) 72%, transparent);
        overflow-wrap: anywhere;
    }
    .fg-meta {
        margin-top: 2px;
        max-width: 46ch;
        font-family: "Fraunces", serif;
        font-size: 14.5px;
        line-height: 1.45;
        color: color-mix(in srgb, var(--fg-ink) 64%, transparent);
    }
    .fg-mine {
        display: flex;
        align-items: center;
        gap: 2px;
        margin: 0 0 -8px -2px;
        font-family: "Rubik", sans-serif;
        font-size: 14px;
        color: color-mix(in srgb, var(--fg-ink) 62%, transparent);
    }
    .fg-mine span {
        padding: 0 8px 0 2px;
        font-style: italic;
        font-family: "Fraunces", serif;
    }
    .fg-mine button {
        min-height: 44px;
        padding: 0 10px;
        font: inherit;
        font-weight: 500;
        color: var(--fg-ink);
        text-decoration: underline;
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
        background: none;
        border: 0;
        cursor: pointer;
    }
    .fg-empty {
        text-align: center;
        font-family: "Fraunces", serif;
        font-style: italic;
        font-size: 16.5px;
        color: color-mix(in srgb, var(--fg-ink) 58%, transparent);
    }
    .fg-ideas {
        margin-top: 8px;
        text-align: center;
        font-family: "Fraunces", serif;
        font-size: 16px;
        line-height: 2.2;
        color: color-mix(in srgb, var(--fg-ink) 62%, transparent);
    }
    .fg-ideas-lead {
        font-style: italic;
        margin-right: 6px;
    }
    /* Inline words: an invisible ::before grows the tap area to ~46px
       tall without spreading the lines apart. */
    .fg-ideas button {
        position: relative;
        display: inline-block;
        padding: 0;
        line-height: 1.5;
        font: inherit;
        color: var(--fg-ink);
        background: none;
        border: 0;
        cursor: pointer;
        text-decoration: underline;
        text-decoration-style: dotted;
        text-decoration-thickness: 1.5px;
        text-underline-offset: 4px;
        text-decoration-color: color-mix(in srgb, var(--fg-ink) 45%, transparent);
    }
    .fg-ideas button::before {
        content: "";
        position: absolute;
        inset: -10px -3px;
    }
    .fg-ideas button:hover {
        text-decoration-style: solid;
    }
    .fg-dish + .fg-dish {
        margin-top: 2px;
    }
    .fg-course ul + .fg-ideas {
        margin-top: 6px;
    }

    /* Form on the dark ground */
    .fg-side {
        color: var(--fg-cream);
    }
    .fg-form {
        scroll-margin-top: 128px;
    }
    .fg-form h2,
    .fg-tips h2 {
        font-family: "Fraunces", serif;
        font-weight: 560;
        font-size: 30px;
        line-height: 1.15;
        color: var(--fg-cream);
    }
    .fg-form-sub {
        margin-top: 8px;
        font-family: "Rubik", sans-serif;
        font-size: 16px;
        line-height: 1.5;
        color: color-mix(in srgb, var(--fg-cream) 72%, transparent);
    }
    .fg-form form {
        margin-top: 22px;
    }
    .fg-field {
        margin-top: 18px;
        border: 0;
        padding: 0;
        min-width: 0;
    }
    .fg-field:first-child {
        margin-top: 0;
    }
    .fg-field > label,
    .fg-field legend {
        display: block;
        margin-bottom: 7px;
        font-family: "Rubik", sans-serif;
        font-size: 15px;
        font-weight: 500;
        color: var(--fg-cream);
        padding: 0;
    }
    .fg-field label span,
    .fg-field legend span {
        font-weight: 400;
        color: color-mix(in srgb, var(--fg-cream) 60%, transparent);
    }
    .fg-field input[type="text"],
    .fg-field textarea,
    .fg-select select {
        display: block;
        width: 100%;
        min-height: 50px;
        padding: 12px 14px;
        font-family: "Rubik", sans-serif;
        font-size: 17px;
        line-height: 1.35;
        color: var(--fg-ink);
        background: var(--fg-paper);
        border: 1.5px solid transparent;
        border-radius: 10px;
        box-shadow: inset 0 1px 2px rgba(42, 26, 18, 0.12);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .fg-field textarea {
        resize: vertical;
        min-height: 76px;
    }
    .fg-field input::placeholder,
    .fg-field textarea::placeholder {
        color: color-mix(in srgb, var(--fg-ink) 42%, transparent);
    }
    .fg-field input[type="text"]:focus,
    .fg-field textarea:focus,
    .fg-select select:focus {
        outline: none;
        border-color: var(--fg-firefly);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--fg-firefly) 35%, transparent);
    }
    .fg-select {
        position: relative;
    }
    .fg-select select {
        appearance: none;
        -webkit-appearance: none;
        padding-right: 44px;
        cursor: pointer;
    }
    .fg-select::after {
        content: "";
        position: absolute;
        right: 18px;
        top: 50%;
        width: 9px;
        height: 9px;
        border-right: 1.75px solid var(--fg-ink);
        border-bottom: 1.75px solid var(--fg-ink);
        transform: translateY(-70%) rotate(45deg);
        pointer-events: none;
    }

    .fg-tag-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 12px;
    }
    .fg-check {
        position: relative;
        display: flex;
        align-items: center;
        gap: 11px;
        min-height: 44px;
        font-family: "Rubik", sans-serif;
        font-size: 16px;
        color: var(--fg-cream);
        cursor: pointer;
    }
    .fg-check input {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
    }
    .fg-box {
        flex: none;
        width: 22px;
        height: 22px;
        border-radius: 5px;
        background: color-mix(in srgb, var(--fg-paper) 12%, transparent);
        border: 1.5px solid color-mix(in srgb, var(--fg-cream) 55%, transparent);
        display: grid;
        place-items: center;
    }
    .fg-check input:checked + .fg-box {
        background: var(--fg-paper);
        border-color: var(--fg-paper);
    }
    .fg-check input:checked + .fg-box::after {
        content: "";
        width: 6px;
        height: 11px;
        margin-top: -2px;
        border-right: 2px solid var(--fg-ink);
        border-bottom: 2px solid var(--fg-ink);
        transform: rotate(45deg);
    }
    .fg-check input:focus-visible + .fg-box {
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--fg-firefly) 55%, transparent);
    }

    .fg-repeat {
        margin-top: 12px;
        padding: 13px 15px;
        border-radius: 10px;
        background: color-mix(in srgb, var(--fg-firefly) 13%, transparent);
        font-family: "Rubik", sans-serif;
        font-size: 16px;
        line-height: 1.45;
        color: var(--fg-cream);
    }
    .fg-repeat strong {
        font-weight: 600;
        color: var(--fg-firefly);
    }
    .fg-repeat p + p {
        margin-top: 4px;
    }
    .fg-repeat .fg-repeat-hint {
        margin-top: 6px;
        font-size: 14.5px;
        color: color-mix(in srgb, var(--fg-cream) 72%, transparent);
    }

    .fg-error {
        margin-top: 16px;
        font-family: "Rubik", sans-serif;
        font-size: 15.5px;
        line-height: 1.45;
        color: var(--fg-firefly);
    }

    .fg-submit {
        display: block;
        width: 100%;
        min-height: 54px;
        margin-top: 22px;
        padding: 0 20px;
        font-family: "Rubik", sans-serif;
        font-size: 17px;
        font-weight: 600;
        color: var(--fg-night);
        background: var(--fg-firefly);
        border: 0;
        border-radius: 999px;
        cursor: pointer;
        box-shadow: 0 0 26px -6px color-mix(in srgb, var(--fg-firefly) 60%, transparent);
        transition: transform 0.12s ease, filter 0.15s ease;
    }
    .fg-submit:hover {
        filter: brightness(1.05);
    }
    .fg-submit:active {
        transform: scale(0.985);
    }
    .fg-submit:disabled {
        opacity: 0.65;
        cursor: progress;
    }
    .fg-submit:focus-visible,
    .fg-bar button:focus-visible {
        outline: 3px solid var(--fg-cream);
        outline-offset: 3px;
    }

    .fg-textbtn {
        min-height: 44px;
        padding: 0 6px;
        font-family: "Rubik", sans-serif;
        font-size: 15.5px;
        font-weight: 500;
        color: inherit;
        background: none;
        border: 0;
        text-decoration: underline;
        text-underline-offset: 4px;
        cursor: pointer;
    }
    .fg-cancel {
        display: block;
        margin: 6px auto 0;
        color: var(--fg-cream);
    }
    .fg-fine {
        margin-top: 14px;
        font-family: "Rubik", sans-serif;
        font-size: 14px;
        line-height: 1.5;
        text-align: center;
        color: color-mix(in srgb, var(--fg-cream) 58%, transparent);
    }

    .fg-tips {
        margin: 52px 0 0;
        font-family: "Fraunces", serif;
        color: var(--fg-cream);
    }
    .fg-tips h2 {
        font-size: 22px;
        font-style: italic;
        margin-bottom: 12px;
    }
    .fg-tips p {
        font-size: 16.5px;
        line-height: 1.5;
        color: color-mix(in srgb, var(--fg-cream) 82%, transparent);
    }
    .fg-tips p + p {
        margin-top: 8px;
    }
    @media (min-width: 1024px) {
        .fg-tips {
            margin: 64px 0 0;
            text-align: center;
        }
        .fg-tips h2 {
            font-size: 24px;
            margin-bottom: 18px;
        }
        .fg-tips-list {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 48px;
            max-width: 920px;
            margin: 0 auto;
        }
        .fg-tips p + p {
            margin-top: 0;
        }
        .fg-back {
            margin-top: 22px;
        }

        /* A mouse needs less room than a thumb: tighten the form so it
           fits beside the menu on a laptop screen. */
        .fg-field {
            margin-top: 14px;
        }
        .fg-field input[type="text"],
        .fg-select select {
            min-height: 46px;
            padding-block: 10px;
        }
        .fg-field textarea {
            min-height: 66px;
            padding-block: 10px;
        }
        .fg-check {
            min-height: 36px;
        }
        .fg-submit {
            margin-top: 18px;
        }
        .fg-fine {
            margin-top: 10px;
        }
    }
    .fg-back {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        margin-top: 18px;
        font-family: "Rubik", sans-serif;
        font-size: 15px;
        color: var(--fg-cream);
        text-decoration: underline;
        text-decoration-thickness: 1px;
        text-underline-offset: 4px;
        text-decoration-color: color-mix(in srgb, var(--fg-cream) 45%, transparent);
    }
    .fg-back:hover {
        text-decoration-color: var(--fg-cream);
    }

    /* Phone sticky bar */
    .fg-bar {
        position: fixed;
        z-index: 40;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
        background: linear-gradient(to top, color-mix(in srgb, var(--fg-night) 96%, transparent) 60%, transparent);
        transition: transform 0.25s ease, opacity 0.25s ease;
    }
    .fg-bar.is-hidden {
        transform: translateY(110%);
        opacity: 0;
        pointer-events: none;
    }
    .fg-bar button {
        display: block;
        width: 100%;
        max-width: 480px;
        min-height: 50px;
        margin: 0 auto;
        font-family: "Rubik", sans-serif;
        font-size: 17px;
        font-weight: 600;
        color: var(--fg-night);
        background: var(--fg-firefly);
        border: 0;
        border-radius: 999px;
        cursor: pointer;
        box-shadow: 0 6px 24px -6px rgba(0, 0, 0, 0.6);
    }
    @media (min-width: 1024px) {
        .fg-bar {
            display: none;
        }
    }

    .fg-toast {
        position: fixed;
        z-index: 45;
        left: 16px;
        right: 16px;
        bottom: calc(84px + env(safe-area-inset-bottom));
        display: flex;
        justify-content: center;
        pointer-events: none;
    }
    .fg-toast p {
        max-width: 420px;
        padding: 13px 18px;
        border-radius: 12px;
        background: var(--fg-night);
        color: var(--fg-cream);
        border: 1px solid color-mix(in srgb, var(--fg-firefly) 40%, transparent);
        font-family: "Fraunces", serif;
        font-size: 16.5px;
        line-height: 1.4;
        text-align: center;
        box-shadow: 0 14px 40px -10px rgba(0, 0, 0, 0.7);
        animation: fg-toast-in 0.3s ease-out;
    }
    @media (min-width: 1024px) {
        .fg-toast {
            bottom: 28px;
        }
    }
    @keyframes fg-toast-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: none; }
    }

    @media (prefers-reduced-motion: reduce) {
        .fg-live.is-live .fg-live-dot,
        .fg-dish.is-new,
        .fg-toast p {
            animation: none;
        }
        .fg-dish.is-new {
            background-color: color-mix(in srgb, var(--fg-leaf-gold) 25%, transparent);
        }
        .fg-bar {
            transition: none;
        }
    }
</style>
