<script>
    import { onMount, onDestroy } from "svelte";
    import { supabase, SUPABASE_CONFIG_ERROR } from "../lib/supabaseClient.js";
    import {
        potluckEvent,
        potluckCategories,
        potluckDietaryTags,
        potluckStillNeeded,
    } from "../data/potluck.js";

    const EVENT_SLUG = potluckEvent.slug;
    const NAME_KEY = "lsp-potluck-name";
    const ITEM_TOKENS_KEY = "lsp-potluck-item-tokens";
    const RSVP_TOKENS_KEY = "lsp-potluck-rsvp-tokens";

    // Live data
    let items = [];
    let rsvps = [];
    let loading = true;
    let loadError = "";
    let live = false;

    // Per-browser secrets handed back by the add RPCs. Owning a token is what
    // makes an entry "yours" (editable/removable) on this device.
    let myItemTokens = {};
    let myRsvpTokens = {};

    // Dish form
    let formName = "";
    let formItem = "";
    let formCategory = "";
    let formServes = "";
    let formTags = [];
    let formNotes = "";
    let editingId = null;
    let submitting = false;
    let submitError = "";
    let flash = "";

    // RSVP form
    let rsvpName = "";
    let rsvpPartySize = 1;
    let rsvpSubmitting = false;
    let rsvpError = "";
    let editingRsvp = false;

    let formSection;
    let channel = null;
    let refetchTimer = null;
    let flashTimer = null;

    // Timebox Supabase calls so a hung request surfaces retry UI instead of
    // spinning forever (same guard the ballot and inventory forms use).
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
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Private mode: entries still post, they just won't be editable
            // after a reload. Not worth blocking on.
        }
    }

    async function loadAll() {
        if (!supabase) {
            loading = false;
            loadError = SUPABASE_CONFIG_ERROR;
            return;
        }

        const result = await withTimeout(
            Promise.all([
                supabase
                    .from("potluck_items")
                    .select(
                        "id, contributor_name, item_name, category, serves, dietary_tags, notes, created_at",
                    )
                    .eq("event_slug", EVENT_SLUG)
                    .order("created_at", { ascending: true }),
                supabase
                    .from("potluck_rsvps")
                    .select("id, name, party_size, created_at")
                    .eq("event_slug", EVENT_SLUG)
                    .order("created_at", { ascending: true }),
            ]),
            10000,
        );

        if (result === RPC_TIMEOUT) {
            loading = false;
            loadError = "The table is taking too long to load. Please retry.";
            return;
        }

        const [itemsRes, rsvpsRes] = result;
        if (itemsRes.error || rsvpsRes.error) {
            loading = false;
            loadError = "We couldn't load the table. Please retry.";
            console.error(
                "Potluck load error:",
                itemsRes.error?.message || rsvpsRes.error?.message,
            );
            return;
        }

        items = itemsRes.data ?? [];
        rsvps = rsvpsRes.data ?? [];
        loading = false;
        loadError = "";
    }

    // Realtime events are "something changed" signals; the list itself is
    // always re-derived from a (debounced) refetch, which also reconciles our
    // own optimistic writes. DELETE payloads only carry the primary key, so a
    // refetch is the simplest correct response to every event type.
    function scheduleRefetch() {
        if (refetchTimer) clearTimeout(refetchTimer);
        refetchTimer = setTimeout(loadAll, 250);
    }

    function handleFocus() {
        loadAll();
    }

    onMount(() => {
        myItemTokens = readStorage(ITEM_TOKENS_KEY, {});
        myRsvpTokens = readStorage(RSVP_TOKENS_KEY, {});
        const savedName = readStorage(NAME_KEY, "");
        formName = savedName;
        rsvpName = savedName;

        loadAll();

        if (supabase) {
            channel = supabase
                .channel("potluck-live")
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "potluck_items" },
                    scheduleRefetch,
                )
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "potluck_rsvps" },
                    scheduleRefetch,
                )
                .subscribe((status) => {
                    live = status === "SUBSCRIBED";
                });
        }

        window.addEventListener("focus", handleFocus);
    });

    onDestroy(() => {
        if (channel && supabase) supabase.removeChannel(channel);
        if (refetchTimer) clearTimeout(refetchTimer);
        if (flashTimer) clearTimeout(flashTimer);
        if (typeof window !== "undefined") {
            window.removeEventListener("focus", handleFocus);
        }
    });

    function showFlash(message) {
        flash = message;
        if (flashTimer) clearTimeout(flashTimer);
        flashTimer = setTimeout(() => {
            flash = "";
        }, 5000);
    }

    function rememberName(name) {
        writeStorage(NAME_KEY, name);
    }

    // ---- Derived state (reactive statements read state directly; helpers
    // below are pure functions of their arguments only) ----

    function namesOverlap(existingName, query) {
        const a = existingName.toLowerCase();
        if (a.includes(query) || query.includes(a)) return true;
        const queryWords = query.split(/\s+/).filter((w) => w.length >= 4);
        return queryWords.some((w) => a.includes(w));
    }

    $: categoryCounts = potluckCategories.map((c) => ({
        ...c,
        count: items.filter((i) => i.category === c.id).length,
    }));

    $: grouped = potluckCategories
        .map((c) => ({
            ...c,
            list: items.filter((i) => i.category === c.id),
        }))
        .filter((g) => g.list.length > 0);

    $: mostNeeded =
        items.length >= 3
            ? categoryCounts
                  .filter((c) => c.food)
                  .reduce(
                      (lowest, c) =>
                          lowest === null || c.count < lowest.count ? c : lowest,
                      null,
                  )
            : null;

    // Only mains count toward the headline coverage number: chips, desserts,
    // and drinks pad a grand total fast without actually feeding anyone
    // dinner, so a sum across every category reads as more food than there is.
    $: mainServings = items
        .filter((i) => i.category === "main")
        .reduce((sum, i) => sum + (i.serves || 0), 0);
    $: totalGuests = rsvps.reduce((sum, r) => sum + (r.party_size || 0), 0);
    $: needMoreFood = totalGuests > 0 && mainServings < totalGuests;

    $: veggieFriendly = items.filter(
        (i) =>
            i.dietary_tags?.includes("vegetarian") ||
            i.dietary_tags?.includes("vegan"),
    ).length;

    $: dupQuery = formItem.trim().toLowerCase();
    $: dupMatches =
        dupQuery.length >= 3
            ? items.filter(
                  (i) =>
                      i.id !== editingId && namesOverlap(i.item_name, dupQuery),
              )
            : [];

    $: openNeeds = potluckStillNeeded.filter(
        (need) =>
            !items.some((i) =>
                need.match.some((kw) => i.item_name.toLowerCase().includes(kw)),
            ),
    );

    $: myRsvp = rsvps.find((r) => myRsvpTokens[r.id]) || null;

    $: showFoodFields = formCategory !== "supplies";

    $: tagsById = potluckDietaryTags.reduce((acc, t) => {
        acc[t.id] = t;
        return acc;
    }, {});

    // ---- Dish form actions ----

    function toggleTag(id) {
        formTags = formTags.includes(id)
            ? formTags.filter((t) => t !== id)
            : [...formTags, id];
    }

    function prefillNeed(need) {
        editingId = null;
        formItem = need.label;
        formCategory = need.category;
        formServes = "";
        formTags = [];
        scrollToForm();
    }

    function scrollToForm() {
        formSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function startEdit(item) {
        editingId = item.id;
        formItem = item.item_name;
        formName = item.contributor_name;
        formCategory = item.category;
        formServes = item.serves ? String(item.serves) : "";
        formTags = [...(item.dietary_tags || [])];
        formNotes = item.notes || "";
        submitError = "";
        scrollToForm();
    }

    function resetForm() {
        editingId = null;
        formItem = "";
        formCategory = "";
        formServes = "";
        formTags = [];
        formNotes = "";
        submitError = "";
    }

    async function submitItem() {
        submitError = "";
        const name = formName.trim();
        const itemName = formItem.trim();

        if (!name) {
            submitError = "Add your name so people know who to thank.";
            return;
        }
        if (!itemName) {
            submitError = "Tell us what you're bringing.";
            return;
        }
        if (!formCategory) {
            submitError = "Pick a category so the table stays balanced.";
            return;
        }

        // bind:value on a number input yields a number, not a string, so
        // normalize before validating.
        const servesRaw = String(formServes ?? "").trim();
        let serves = null;
        if (showFoodFields && servesRaw !== "") {
            serves = Number.parseInt(servesRaw, 10);
            if (!Number.isFinite(serves) || serves < 1 || serves > 200) {
                submitError = "Serves should be a number between 1 and 200.";
                return;
            }
        }

        const payloadTags = showFoodFields ? formTags : [];
        submitting = true;

        const rpcName = editingId ? "potluck_update_item" : "potluck_add_item";
        const args = editingId
            ? {
                  p_item_id: editingId,
                  p_token: myItemTokens[editingId],
                  p_contributor_name: name,
                  p_item_name: itemName,
                  p_category: formCategory,
                  p_serves: serves,
                  p_dietary_tags: payloadTags,
                  p_notes: formNotes.trim() || null,
              }
            : {
                  p_event_slug: EVENT_SLUG,
                  p_contributor_name: name,
                  p_item_name: itemName,
                  p_category: formCategory,
                  p_serves: serves,
                  p_dietary_tags: payloadTags,
                  p_notes: formNotes.trim() || null,
              };

        let result;
        try {
            result = await withTimeout(supabase.rpc(rpcName, args), 12000);
        } catch (err) {
            result = { error: err };
        }
        submitting = false;

        if (result === RPC_TIMEOUT) {
            submitError = "That took too long. Please try again.";
            return;
        }
        if (result.error) {
            console.error("Potluck submit error:", result.error.message);
            submitError = "Something went wrong. Please try again.";
            return;
        }
        const data = result.data;
        if (!data?.ok) {
            submitError =
                data?.reason === "event_full"
                    ? "The list is full. Reach out to the LSP team."
                    : data?.reason === "not_found"
                      ? "We couldn't verify this entry belongs to this device."
                      : "Please double-check your entry and try again.";
            return;
        }

        rememberName(name);
        rsvpName = rsvpName || name;

        if (editingId) {
            items = items.map((i) =>
                i.id === editingId
                    ? {
                          ...i,
                          contributor_name: name,
                          item_name: itemName,
                          category: formCategory,
                          serves,
                          dietary_tags: payloadTags,
                          notes: formNotes.trim() || null,
                      }
                    : i,
            );
            showFlash("Updated. The table thanks you.");
        } else {
            myItemTokens = { ...myItemTokens, [data.id]: data.token };
            writeStorage(ITEM_TOKENS_KEY, myItemTokens);
            items = [
                ...items,
                {
                    id: data.id,
                    contributor_name: name,
                    item_name: itemName,
                    category: formCategory,
                    serves,
                    dietary_tags: payloadTags,
                    notes: formNotes.trim() || null,
                    created_at: new Date().toISOString(),
                },
            ];
            showFlash(`¡Listo! ${itemName} is on the table.`);
        }
        resetForm();
    }

    async function removeItem(item) {
        const sure = window.confirm(
            `Take "${item.item_name}" off the table?`,
        );
        if (!sure) return;

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

        if (result === RPC_TIMEOUT || result.error || !result.data?.ok) {
            showFlash("We couldn't remove that just now. Please try again.");
            return;
        }

        items = items.filter((i) => i.id !== item.id);
        const { [item.id]: _removed, ...rest } = myItemTokens;
        myItemTokens = rest;
        writeStorage(ITEM_TOKENS_KEY, myItemTokens);
        if (editingId === item.id) resetForm();
    }

    // ---- RSVP actions ----

    async function submitRsvp() {
        rsvpError = "";
        const name = rsvpName.trim();
        if (!name) {
            rsvpError = "Add your name to confirm.";
            return;
        }
        const size = Number.parseInt(String(rsvpPartySize), 10);
        if (!Number.isFinite(size) || size < 1 || size > 20) {
            rsvpError = "Party size should be between 1 and 20.";
            return;
        }

        rsvpSubmitting = true;
        const updating = editingRsvp && myRsvp;
        let result;
        try {
            result = await withTimeout(
                updating
                    ? supabase.rpc("potluck_update_rsvp", {
                          p_rsvp_id: myRsvp.id,
                          p_token: myRsvpTokens[myRsvp.id],
                          p_name: name,
                          p_party_size: size,
                      })
                    : supabase.rpc("potluck_add_rsvp", {
                          p_event_slug: EVENT_SLUG,
                          p_name: name,
                          p_party_size: size,
                      }),
                12000,
            );
        } catch (err) {
            result = { error: err };
        }
        rsvpSubmitting = false;

        if (result === RPC_TIMEOUT) {
            rsvpError = "That took too long. Please try again.";
            return;
        }
        if (result.error || !result.data?.ok) {
            rsvpError = "Something went wrong. Please try again.";
            return;
        }

        rememberName(name);
        formName = formName || name;

        if (updating) {
            rsvps = rsvps.map((r) =>
                r.id === myRsvp.id ? { ...r, name, party_size: size } : r,
            );
            editingRsvp = false;
            showFlash("RSVP updated.");
        } else {
            myRsvpTokens = { ...myRsvpTokens, [result.data.id]: result.data.token };
            writeStorage(RSVP_TOKENS_KEY, myRsvpTokens);
            rsvps = [
                ...rsvps,
                {
                    id: result.data.id,
                    name,
                    party_size: size,
                    created_at: new Date().toISOString(),
                },
            ];
            showFlash(
                size > 1
                    ? `Nos vemos, ${name} +${size - 1}!`
                    : `Nos vemos, ${name}!`,
            );
        }
    }

    function startEditRsvp() {
        if (!myRsvp) return;
        editingRsvp = true;
        rsvpName = myRsvp.name;
        rsvpPartySize = myRsvp.party_size;
    }

    async function removeRsvp() {
        if (!myRsvp) return;
        const sure = window.confirm("Remove your RSVP?");
        if (!sure) return;

        const id = myRsvp.id;
        let result;
        try {
            result = await withTimeout(
                supabase.rpc("potluck_remove_rsvp", {
                    p_rsvp_id: id,
                    p_token: myRsvpTokens[id],
                }),
                12000,
            );
        } catch (err) {
            result = { error: err };
        }

        if (result === RPC_TIMEOUT || result.error || !result.data?.ok) {
            showFlash("We couldn't remove that just now. Please try again.");
            return;
        }

        rsvps = rsvps.filter((r) => r.id !== id);
        const { [id]: _removed, ...rest } = myRsvpTokens;
        myRsvpTokens = rest;
        writeStorage(RSVP_TOKENS_KEY, myRsvpTokens);
        editingRsvp = false;
    }
</script>

{#if !supabase}
    <div
        class="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5"
    >
        <p class="font-body text-medium-gray">
            The potluck board isn't available right now. Please try again
            later.
        </p>
    </div>
{:else if loading}
    <div
        class="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5"
    >
        <div
            class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-vibrant-pink/30 border-t-vibrant-pink"
            aria-hidden="true"
        ></div>
        <p class="mt-4 font-body text-medium-gray">Setting the table…</p>
    </div>
{:else if loadError}
    <div
        class="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5"
    >
        <p class="font-body text-medium-gray">{loadError}</p>
        <button
            type="button"
            class="mt-4 rounded-full bg-off-black px-6 py-2.5 font-sans text-sm font-bold text-white transition hover:bg-vibrant-pink"
            on:click={() => {
                loading = true;
                loadAll();
            }}
        >
            Retry
        </button>
    </div>
{:else}
    <div class="space-y-8">
        <!-- Live status + headline numbers -->
        <div class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <h2 class="font-sans text-xl font-bold text-off-black">
                    The table so far
                </h2>
                <span
                    class="inline-flex items-center gap-2 rounded-full px-3 py-1 font-sans text-xs font-bold uppercase tracking-wider {live
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'}"
                >
                    <span class="relative flex h-2 w-2">
                        {#if live}
                            <span
                                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60"
                            ></span>
                        {/if}
                        <span
                            class="relative inline-flex h-2 w-2 rounded-full {live
                                ? 'bg-green-500'
                                : 'bg-gray-400'}"
                        ></span>
                    </span>
                    {live ? "Live" : "Connecting…"}
                </span>
            </div>

            <dl class="mt-4 grid grid-cols-3 gap-3 text-center">
                <div class="rounded-xl bg-light-gray px-2 py-4">
                    <dd
                        class="font-sans text-3xl font-extrabold text-off-black"
                    >
                        {items.length}
                    </dd>
                    <dt class="mt-1 font-sans text-xs font-bold uppercase tracking-wider text-medium-gray">
                        {items.length === 1 ? "Item" : "Items"}
                    </dt>
                </div>
                <div class="rounded-xl bg-light-gray px-2 py-4">
                    <dd
                        class="font-sans text-3xl font-extrabold text-off-black"
                    >
                        ~{mainServings}
                    </dd>
                    <dt class="mt-1 font-sans text-xs font-bold uppercase tracking-wider text-medium-gray">
                        Main-dish servings
                    </dt>
                </div>
                <div class="rounded-xl bg-light-gray px-2 py-4">
                    <dd
                        class="font-sans text-3xl font-extrabold text-off-black"
                    >
                        {totalGuests}
                    </dd>
                    <dt class="mt-1 font-sans text-xs font-bold uppercase tracking-wider text-medium-gray">
                        Confirmed
                    </dt>
                </div>
            </dl>
            <p class="mt-2 text-center font-body text-xs text-medium-gray">
                Mains only, and serving counts are the cooks' best guess. When
                in doubt, bring a little extra.
            </p>

            <div class="mt-4 flex flex-wrap gap-2">
                {#each categoryCounts as cat (cat.id)}
                    <span
                        class="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-sans text-xs font-semibold {cat.count ===
                            0 && cat.food
                            ? 'border border-dashed border-amber-400 bg-amber-50 text-amber-700'
                            : 'bg-gray-100 text-gray-700'}"
                    >
                        <span aria-hidden="true">{cat.emoji}</span>
                        {cat.label} · {cat.count}
                        {#if cat.count === 0 && cat.food}
                            <span class="font-bold">· still open</span>
                        {/if}
                    </span>
                {/each}
            </div>

            {#if needMoreFood}
                <p
                    class="mt-4 rounded-xl bg-amber-50 px-4 py-3 font-body text-sm text-amber-800"
                >
                    {#if mainServings === 0}
                        Heads up: {totalGuests}
                        {totalGuests === 1 ? "person is" : "people are"} confirmed
                        and there's no main dish yet. Mains would go a long
                        way.
                    {:else}
                        Heads up: the mains so far serve about {mainServings},
                        and {totalGuests}
                        {totalGuests === 1 ? "person is" : "people are"} confirmed.
                        More mains would go a long way.
                    {/if}
                </p>
            {:else if mostNeeded && mostNeeded.count === 0}
                <p
                    class="mt-4 rounded-xl bg-amber-50 px-4 py-3 font-body text-sm text-amber-800"
                >
                    Most needed right now: {mostNeeded.emoji}
                    {mostNeeded.label.toLowerCase()}.
                </p>
            {/if}

            {#if veggieFriendly === 0 && items.length >= 4}
                <p
                    class="mt-3 rounded-xl bg-emerald-50 px-4 py-3 font-body text-sm text-emerald-800"
                >
                    Nothing vegetarian on the table yet. A plant-based dish
                    would make sure everyone eats well. 🌱
                </p>
            {/if}

            {#if openNeeds.length > 0}
                <div class="mt-5 border-t border-black/5 pt-4">
                    <p
                        class="font-sans text-xs font-bold uppercase tracking-wider text-medium-gray"
                    >
                        Nobody's claimed these yet · tap one to bring it
                    </p>
                    <div class="mt-2 flex flex-wrap gap-2">
                        {#each openNeeds as need (need.label)}
                            <button
                                type="button"
                                class="rounded-full border-2 border-off-black/15 px-4 py-1.5 font-sans text-sm font-semibold text-off-black transition hover:border-vibrant-pink hover:text-vibrant-pink"
                                on:click={() => prefillNeed(need)}
                            >
                                {need.label}
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>

        <!-- Add / edit dish -->
        <div
            bind:this={formSection}
            class="scroll-mt-28 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8"
        >
            <h2 class="font-sans text-xl font-bold text-off-black">
                {editingId ? "Edit your dish" : "What are you bringing?"}
            </h2>
            <p class="mt-1 font-body text-sm text-medium-gray">
                {editingId
                    ? "Make your changes and save. Everyone's view updates instantly."
                    : "Add it here and it shows up on everyone's screen right away."}
            </p>

            <form
                class="mt-6 space-y-5"
                on:submit|preventDefault={submitItem}
            >
                <div class="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label
                            for="potluck-name"
                            class="mb-1.5 block font-sans text-sm font-bold text-off-black"
                        >
                            Your name
                        </label>
                        <input
                            id="potluck-name"
                            type="text"
                            bind:value={formName}
                            maxlength="80"
                            autocomplete="name"
                            placeholder="Maria G."
                            class="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-off-black transition focus:border-vibrant-pink focus:outline-none"
                        />
                    </div>
                    <div>
                        <label
                            for="potluck-item"
                            class="mb-1.5 block font-sans text-sm font-bold text-off-black"
                        >
                            What is it?
                        </label>
                        <input
                            id="potluck-item"
                            type="text"
                            bind:value={formItem}
                            maxlength="120"
                            placeholder="Tinga tostadas, elote dip, agua de jamaica…"
                            class="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-off-black transition focus:border-vibrant-pink focus:outline-none"
                        />
                    </div>
                </div>

                {#if dupMatches.length > 0}
                    <p
                        class="rounded-xl bg-blue-50 px-4 py-3 font-body text-sm text-blue-800"
                    >
                        {dupMatches[0].contributor_name} is already bringing
                        "{dupMatches[0].item_name}". Doubles are welcome,
                        variety is better. 😉
                    </p>
                {/if}

                <fieldset>
                    <legend
                        class="mb-2 font-sans text-sm font-bold text-off-black"
                    >
                        Category
                    </legend>
                    <div class="flex flex-wrap gap-2">
                        {#each potluckCategories as cat (cat.id)}
                            <button
                                type="button"
                                aria-pressed={formCategory === cat.id}
                                class="rounded-full px-4 py-2 font-sans text-sm font-semibold transition {formCategory ===
                                cat.id
                                    ? 'bg-off-black text-white'
                                    : 'border-2 border-gray-200 text-gray-700 hover:border-vibrant-pink hover:text-vibrant-pink'}"
                                on:click={() => (formCategory = cat.id)}
                            >
                                <span aria-hidden="true">{cat.emoji}</span>
                                {cat.label}
                            </button>
                        {/each}
                    </div>
                </fieldset>

                {#if showFoodFields}
                    <div class="grid gap-4 sm:grid-cols-2">
                        <div>
                            <label
                                for="potluck-serves"
                                class="mb-1.5 block font-sans text-sm font-bold text-off-black"
                            >
                                Serves about how many?
                                <span class="font-normal text-medium-gray"
                                    >(optional)</span
                                >
                            </label>
                            <input
                                id="potluck-serves"
                                type="number"
                                min="1"
                                max="200"
                                bind:value={formServes}
                                placeholder="8"
                                class="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-off-black transition focus:border-vibrant-pink focus:outline-none"
                            />
                            <p class="mt-1 font-body text-xs text-medium-gray">
                                Helps us make sure there's enough for everyone.
                            </p>
                        </div>
                        <fieldset>
                            <legend
                                class="mb-1.5 font-sans text-sm font-bold text-off-black"
                            >
                                Good to know
                                <span class="font-normal text-medium-gray"
                                    >(tap all that apply)</span
                                >
                            </legend>
                            <div class="flex flex-wrap gap-1.5">
                                {#each potluckDietaryTags as tag (tag.id)}
                                    <button
                                        type="button"
                                        aria-pressed={formTags.includes(tag.id)}
                                        class="rounded-full px-3 py-1.5 font-sans text-xs font-semibold transition {formTags.includes(
                                            tag.id,
                                        )
                                            ? 'bg-vibrant-pink text-white'
                                            : 'border-2 border-gray-200 text-gray-600 hover:border-vibrant-pink'}"
                                        on:click={() => toggleTag(tag.id)}
                                    >
                                        <span aria-hidden="true"
                                            >{tag.emoji}</span
                                        >
                                        {tag.label}
                                    </button>
                                {/each}
                            </div>
                        </fieldset>
                    </div>
                {/if}

                <div>
                    <label
                        for="potluck-notes"
                        class="mb-1.5 block font-sans text-sm font-bold text-off-black"
                    >
                        Notes
                        <span class="font-normal text-medium-gray"
                            >(optional)</span
                        >
                    </label>
                    <textarea
                        id="potluck-notes"
                        bind:value={formNotes}
                        maxlength="280"
                        rows="2"
                        placeholder="Needs a fridge spot, arriving at 6:30, abuela's recipe…"
                        class="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-off-black transition focus:border-vibrant-pink focus:outline-none"
                    ></textarea>
                </div>

                {#if submitError}
                    <p
                        class="rounded-xl bg-red-50 px-4 py-3 font-body text-sm text-red-700"
                        role="alert"
                    >
                        {submitError}
                    </p>
                {/if}

                <div class="flex flex-wrap items-center gap-3">
                    <button
                        type="submit"
                        disabled={submitting}
                        class="rounded-full bg-off-black px-8 py-3 font-sans text-sm font-bold text-white transition hover:bg-vibrant-pink disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {submitting
                            ? "Saving…"
                            : editingId
                              ? "Save changes"
                              : "Add to the table"}
                    </button>
                    {#if editingId}
                        <button
                            type="button"
                            class="font-sans text-sm font-semibold text-medium-gray underline underline-offset-4 transition hover:text-off-black"
                            on:click={resetForm}
                        >
                            Cancel
                        </button>
                    {/if}
                </div>
            </form>
        </div>

        <!-- RSVP -->
        <div class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
            <h2 class="font-sans text-xl font-bold text-off-black">
                Just coming to eat? Perfecto.
            </h2>
            <p class="mt-1 font-body text-sm text-medium-gray">
                Confirm you're coming so the cooks know how many to feed. Bring
                your appetite and your people.
            </p>

            {#if myRsvp && !editingRsvp}
                <div
                    class="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-green-50 px-4 py-3"
                >
                    <p class="font-body text-sm text-green-800">
                        You're confirmed: <strong>{myRsvp.name}</strong>
                        {myRsvp.party_size > 1
                            ? `+ ${myRsvp.party_size - 1} more`
                            : ""}
                    </p>
                    <div class="flex gap-3">
                        <button
                            type="button"
                            class="font-sans text-xs font-bold text-green-800 underline underline-offset-2"
                            on:click={startEditRsvp}
                        >
                            Edit
                        </button>
                        <button
                            type="button"
                            class="font-sans text-xs font-bold text-green-800 underline underline-offset-2"
                            on:click={removeRsvp}
                        >
                            Remove
                        </button>
                    </div>
                </div>
            {:else}
                <form
                    class="mt-5 flex flex-wrap items-end gap-3"
                    on:submit|preventDefault={submitRsvp}
                >
                    <div class="min-w-40 flex-1">
                        <label
                            for="rsvp-name"
                            class="mb-1.5 block font-sans text-sm font-bold text-off-black"
                        >
                            Your name
                        </label>
                        <input
                            id="rsvp-name"
                            type="text"
                            bind:value={rsvpName}
                            maxlength="80"
                            autocomplete="name"
                            placeholder="Maria G."
                            class="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-off-black transition focus:border-vibrant-pink focus:outline-none"
                        />
                    </div>
                    <div class="w-28">
                        <label
                            for="rsvp-size"
                            class="mb-1.5 block font-sans text-sm font-bold text-off-black"
                        >
                            How many?
                        </label>
                        <input
                            id="rsvp-size"
                            type="number"
                            min="1"
                            max="20"
                            bind:value={rsvpPartySize}
                            class="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 font-body text-off-black transition focus:border-vibrant-pink focus:outline-none"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={rsvpSubmitting}
                        class="rounded-full bg-off-black px-6 py-3 font-sans text-sm font-bold text-white transition hover:bg-vibrant-pink disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {rsvpSubmitting
                            ? "Saving…"
                            : editingRsvp
                              ? "Update RSVP"
                              : "Count me in"}
                    </button>
                    {#if editingRsvp}
                        <button
                            type="button"
                            class="pb-3 font-sans text-sm font-semibold text-medium-gray underline underline-offset-4"
                            on:click={() => (editingRsvp = false)}
                        >
                            Cancel
                        </button>
                    {/if}
                </form>
                {#if rsvpError}
                    <p
                        class="mt-3 rounded-xl bg-red-50 px-4 py-3 font-body text-sm text-red-700"
                        role="alert"
                    >
                        {rsvpError}
                    </p>
                {/if}
            {/if}

            {#if rsvps.length > 0}
                <div class="mt-5 border-t border-black/5 pt-4">
                    <p
                        class="font-sans text-xs font-bold uppercase tracking-wider text-medium-gray"
                    >
                        Who's coming · {totalGuests}
                        {totalGuests === 1 ? "person" : "people"}
                    </p>
                    <div class="mt-2 flex flex-wrap gap-2">
                        {#each rsvps as r (r.id)}
                            <span
                                class="rounded-full bg-gray-100 px-3 py-1 font-body text-sm text-gray-700"
                            >
                                {r.name}{r.party_size > 1
                                    ? ` +${r.party_size - 1}`
                                    : ""}
                            </span>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>

        <!-- Flash messages -->
        <div aria-live="polite">
            {#if flash}
                <p
                    class="rounded-2xl bg-green-50 px-6 py-4 text-center font-sans text-sm font-bold text-green-800 shadow-sm ring-1 ring-green-100"
                >
                    {flash}
                </p>
            {/if}
        </div>

        <!-- The live table -->
        <div>
            <h2 class="font-sans text-2xl font-bold text-off-black">
                On the table
            </h2>
            {#if items.length === 0}
                <div
                    class="mt-4 rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center"
                >
                    <p class="text-4xl" aria-hidden="true">🫙</p>
                    <p class="mt-3 font-body text-medium-gray">
                        Nothing on the table yet. Be the first, set the tone.
                    </p>
                </div>
            {:else}
                <div class="mt-4 space-y-8">
                    {#each grouped as group (group.id)}
                        <section>
                            <h3
                                class="flex items-center gap-2 font-sans text-lg font-bold text-off-black"
                            >
                                <span aria-hidden="true">{group.emoji}</span>
                                {group.label}
                                <span
                                    class="rounded-full bg-vibrant-pink/10 px-2.5 py-0.5 font-sans text-xs font-bold text-vibrant-pink"
                                >
                                    {group.list.length}
                                </span>
                            </h3>
                            <div class="mt-3 grid gap-3 sm:grid-cols-2">
                                {#each group.list as item (item.id)}
                                    <article
                                        class="rounded-2xl bg-white p-5 shadow-sm ring-1 {myItemTokens[
                                            item.id
                                        ]
                                            ? 'ring-2 ring-vibrant-pink/50'
                                            : 'ring-black/5'}"
                                    >
                                        <div
                                            class="flex items-start justify-between gap-3"
                                        >
                                            <div>
                                                <h4
                                                    class="font-sans text-base font-bold text-off-black"
                                                >
                                                    {item.item_name}
                                                </h4>
                                                <p
                                                    class="mt-0.5 font-body text-sm text-medium-gray"
                                                >
                                                    from {item.contributor_name}
                                                </p>
                                            </div>
                                            {#if myItemTokens[item.id]}
                                                <span
                                                    class="shrink-0 rounded-full bg-vibrant-pink px-2.5 py-0.5 font-sans text-xs font-bold text-white"
                                                >
                                                    You
                                                </span>
                                            {/if}
                                        </div>

                                        {#if item.serves || (item.dietary_tags || []).length > 0}
                                            <div
                                                class="mt-3 flex flex-wrap gap-1.5"
                                            >
                                                {#if item.serves}
                                                    <span
                                                        class="rounded-full bg-gray-100 px-2.5 py-1 font-sans text-xs font-semibold text-gray-700"
                                                    >
                                                        Serves ~{item.serves}
                                                    </span>
                                                {/if}
                                                {#each item.dietary_tags || [] as tagId (tagId)}
                                                    {#if tagsById[tagId]}
                                                        <span
                                                            class="rounded-full bg-emerald-50 px-2.5 py-1 font-sans text-xs font-semibold text-emerald-700"
                                                        >
                                                            <span
                                                                aria-hidden="true"
                                                                >{tagsById[
                                                                    tagId
                                                                ].emoji}</span
                                                            >
                                                            {tagsById[tagId]
                                                                .label}
                                                        </span>
                                                    {/if}
                                                {/each}
                                            </div>
                                        {/if}

                                        {#if item.notes}
                                            <p
                                                class="mt-3 font-body text-sm italic text-gray-500"
                                            >
                                                {item.notes}
                                            </p>
                                        {/if}

                                        {#if myItemTokens[item.id]}
                                            <div class="mt-4 flex gap-4">
                                                <button
                                                    type="button"
                                                    class="font-sans text-xs font-bold text-off-black underline underline-offset-2 transition hover:text-vibrant-pink"
                                                    on:click={() =>
                                                        startEdit(item)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    class="font-sans text-xs font-bold text-red-600 underline underline-offset-2"
                                                    on:click={() =>
                                                        removeItem(item)}
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        {/if}
                                    </article>
                                {/each}
                            </div>
                        </section>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/if}
