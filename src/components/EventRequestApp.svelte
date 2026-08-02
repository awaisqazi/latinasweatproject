<script>
    import { onMount } from "svelte";

    // The public Google Form behind this page ("LSP Event & Scheduling
    // Request Form"). We render our own UI and POST straight to the form's
    // response endpoint, so responders never see the Google Form itself.
    // Entry IDs come from the form's FB_PUBLIC_LOAD_DATA_; they are stable
    // unless a question is deleted and recreated in the form editor.
    const FORM_RESPONSE_URL =
        "https://docs.google.com/forms/d/e/1FAIpQLSdnBw2k4IWOs6f1HbSMn_g4yht7BZn_lmbjGu_Zt1Oczhhfbg/formResponse";

    const ENTRY = {
        boardName: "entry.694421084",
        email: "entry.1840732866",
        eventName: "entry.1247909940",
        eventDate: "entry.1866426245", // + _year / _month / _day
        startTime: "entry.938148467", // + _hour / _minute
        endTime: "entry.1070743883", // + _hour / _minute
        setupCleanup: "entry.1985119838",
        location: "entry.1519880422",
        notes: "entry.1761302365",
        acknowledgement: "entry.1312210", // checkbox, value must be "I understand"
    };
    const ACK_VALUE = "I understand";

    const NAME_STORAGE_KEY = "lsp_eventrequest_name";
    const EMAIL_STORAGE_KEY = "lsp_eventrequest_email";

    // The Google Form keeps "Event Location" open-ended; the checkboxes only
    // exist on our side, so edit this list freely. Checked options (plus any
    // "Other" text) are joined comma-delimited into the single answer.
    const LOCATION_OPTIONS = [
        "Little Village Room",
        "Gage Park Room",
        "Studio Kitchen",
    ];

    // Form state
    let boardName = "";
    let email = "";
    let eventName = "";
    let eventDate = ""; // YYYY-MM-DD from <input type="date">
    let startTime = ""; // HH:MM from <input type="time">
    let endTime = "";
    let setupCleanup = "";
    let selectedLocations = []; // subset of LOCATION_OPTIONS via bind:group
    let otherLocationChecked = false;
    let locationOther = "";
    let notes = "";
    let acknowledged = false;

    // Submit state
    let showErrors = false;
    let saving = false;
    let submitError = "";

    // Success state
    let success = false;
    let submittedSummary = null; // { eventName, dateLabel, timeLabel, email }

    $: emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
    $: timesInOrder = !(startTime && endTime) || endTime > startTime;
    $: formValid =
        boardName.trim() !== "" &&
        emailValid &&
        eventName.trim() !== "" &&
        timesInOrder &&
        acknowledged;

    onMount(() => {
        // Prefill name and email from a previous request.
        try {
            boardName = window.localStorage.getItem(NAME_STORAGE_KEY) || "";
            email = window.localStorage.getItem(EMAIL_STORAGE_KEY) || "";
        } catch (e) {
            // localStorage may be unavailable (private mode); ignore.
        }
    });

    function formatDateLabel(isoDate) {
        if (!isoDate) return "";
        const [y, m, d] = isoDate.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
        });
    }

    function formatTimeLabel(time) {
        if (!time) return "";
        const [h, min] = time.split(":").map(Number);
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        const suffix = h < 12 ? "AM" : "PM";
        return `${hour12}:${String(min).padStart(2, "0")} ${suffix}`;
    }

    async function handleSubmit(event) {
        event.preventDefault();
        showErrors = true;
        submitError = "";
        if (!formValid || saving) return;

        saving = true;
        try {
            const params = new URLSearchParams();
            params.set(ENTRY.boardName, boardName.trim());
            params.set(ENTRY.email, email.trim());
            params.set(ENTRY.eventName, eventName.trim());

            if (eventDate) {
                const [y, m, d] = eventDate.split("-").map(Number);
                params.set(`${ENTRY.eventDate}_year`, String(y));
                params.set(`${ENTRY.eventDate}_month`, String(m));
                params.set(`${ENTRY.eventDate}_day`, String(d));
            }
            if (startTime) {
                const [h, min] = startTime.split(":").map(Number);
                params.set(`${ENTRY.startTime}_hour`, String(h));
                params.set(`${ENTRY.startTime}_minute`, String(min));
            }
            if (endTime) {
                const [h, min] = endTime.split(":").map(Number);
                params.set(`${ENTRY.endTime}_hour`, String(h));
                params.set(`${ENTRY.endTime}_minute`, String(min));
            }
            if (setupCleanup.trim())
                params.set(ENTRY.setupCleanup, setupCleanup.trim());
            const locationParts = LOCATION_OPTIONS.filter((option) =>
                selectedLocations.includes(option),
            );
            if (otherLocationChecked)
                locationParts.push(locationOther.trim() || "Other");
            if (locationParts.length)
                params.set(ENTRY.location, locationParts.join(", "));
            if (notes.trim()) params.set(ENTRY.notes, notes.trim());

            params.append(ENTRY.acknowledgement, ACK_VALUE);
            params.set(`${ENTRY.acknowledgement}_sentinel`, "");
            params.set("fvv", "1");
            params.set("pageHistory", "0");

            // no-cors: Google doesn't send CORS headers on formResponse, so
            // the response is opaque. A resolved fetch means it reached
            // Google; client-side validation above covers required fields.
            await fetch(FORM_RESPONSE_URL, {
                method: "POST",
                mode: "no-cors",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: params.toString(),
            });

            try {
                window.localStorage.setItem(NAME_STORAGE_KEY, boardName.trim());
                window.localStorage.setItem(EMAIL_STORAGE_KEY, email.trim());
            } catch (e) {
                // ignore storage failures
            }

            submittedSummary = {
                eventName: eventName.trim(),
                dateLabel: formatDateLabel(eventDate),
                timeLabel: [formatTimeLabel(startTime), formatTimeLabel(endTime)]
                    .filter(Boolean)
                    .join(" to "),
                email: email.trim(),
            };
            success = true;
        } catch (e) {
            console.error("Event request submit failed:", e);
            submitError =
                "We couldn't send your request. Check your connection and try again.";
        } finally {
            saving = false;
        }
    }

    function startAnother() {
        eventName = "";
        eventDate = "";
        startTime = "";
        endTime = "";
        setupCleanup = "";
        selectedLocations = [];
        otherLocationChecked = false;
        locationOther = "";
        notes = "";
        acknowledged = false;
        showErrors = false;
        submitError = "";
        success = false;
        submittedSummary = null;
    }
</script>

<div class="max-w-2xl mx-auto px-4 py-10 sm:py-12">
    {#if success}
        <!-- Success confirmation -->
        <div
            class="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center"
        >
            <div
                class="mx-auto w-14 h-14 rounded-full bg-green-100 flex items-center justify-center"
            >
                <svg
                    class="w-7 h-7 text-green-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2.5"
                        d="M5 13l4 4L19 7"
                    />
                </svg>
            </div>
            <h2 class="mt-5 font-rubik text-2xl font-bold text-off-black">
                Request sent!
            </h2>
            <p class="mt-3 font-body text-gray-600 leading-relaxed">
                We received your request for
                <span class="font-bold text-off-black"
                    >{submittedSummary.eventName}</span
                >{#if submittedSummary.dateLabel}
                    on <span class="font-bold text-off-black"
                        >{submittedSummary.dateLabel}</span
                    >{/if}{#if submittedSummary.timeLabel}, {submittedSummary.timeLabel}{/if}.
            </p>
            <p class="mt-2 font-body text-sm text-gray-500 leading-relaxed">
                Remember, this is a request, not a confirmation. The LSP team
                will review it and follow up at
                <span class="font-semibold text-off-black"
                    >{submittedSummary.email}</span
                >.
            </p>
            <button
                type="button"
                on:click={startAnother}
                class="mt-7 px-6 py-3 bg-vibrant-pink text-white rounded-lg font-bold hover:bg-accent-gold transition-colors cursor-pointer"
            >
                Submit another request
            </button>
        </div>
    {:else}
        <form on:submit={handleSubmit} novalidate>
            <div class="bg-white rounded-2xl shadow-sm border border-gray-100">
                <!-- About you -->
                <div class="p-6 sm:p-7">
                    <h2
                        class="font-rubik text-xs font-bold uppercase tracking-[0.14em] text-vibrant-pink"
                    >
                        About you
                    </h2>
                    <div class="mt-4 grid gap-5 sm:grid-cols-2">
                        <div>
                            <label
                                for="er-name"
                                class="block text-sm font-bold text-off-black mb-1.5"
                            >
                                Name <span class="text-vibrant-pink">*</span>
                            </label>
                            <input
                                id="er-name"
                                type="text"
                                bind:value={boardName}
                                placeholder="Your first and last name"
                                autocomplete="name"
                                class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-vibrant-pink focus:ring-2 focus:ring-vibrant-pink/30 focus:outline-none text-off-black"
                            />
                            {#if showErrors && boardName.trim() === ""}
                                <p class="mt-1.5 text-sm font-semibold text-red-600">
                                    Please add your name.
                                </p>
                            {/if}
                        </div>
                        <div>
                            <label
                                for="er-email"
                                class="block text-sm font-bold text-off-black mb-1.5"
                            >
                                Email <span class="text-vibrant-pink">*</span>
                            </label>
                            <input
                                id="er-email"
                                type="email"
                                bind:value={email}
                                placeholder="you@example.com"
                                autocomplete="email"
                                class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-vibrant-pink focus:ring-2 focus:ring-vibrant-pink/30 focus:outline-none text-off-black"
                            />
                            {#if showErrors && !emailValid}
                                <p class="mt-1.5 text-sm font-semibold text-red-600">
                                    Please enter a valid email so we can follow up.
                                </p>
                            {/if}
                        </div>
                    </div>
                </div>

                <hr class="border-gray-100" />

                <!-- Event details -->
                <div class="p-6 sm:p-7">
                    <h2
                        class="font-rubik text-xs font-bold uppercase tracking-[0.14em] text-vibrant-pink"
                    >
                        Event details
                    </h2>
                    <div class="mt-4 space-y-5">
                        <div>
                            <label
                                for="er-event"
                                class="block text-sm font-bold text-off-black mb-1.5"
                            >
                                Event name <span class="text-vibrant-pink">*</span>
                            </label>
                            <input
                                id="er-event"
                                type="text"
                                bind:value={eventName}
                                placeholder="What are you planning?"
                                class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-vibrant-pink focus:ring-2 focus:ring-vibrant-pink/30 focus:outline-none text-off-black"
                            />
                            {#if showErrors && eventName.trim() === ""}
                                <p class="mt-1.5 text-sm font-semibold text-red-600">
                                    Please name your event.
                                </p>
                            {/if}
                        </div>

                        <div class="grid gap-5 sm:grid-cols-3">
                            <div>
                                <label
                                    for="er-date"
                                    class="block text-sm font-bold text-off-black mb-1.5"
                                >
                                    Event date
                                </label>
                                <input
                                    id="er-date"
                                    type="date"
                                    bind:value={eventDate}
                                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-vibrant-pink focus:ring-2 focus:ring-vibrant-pink/30 focus:outline-none text-off-black bg-white"
                                />
                            </div>
                            <div>
                                <label
                                    for="er-start"
                                    class="block text-sm font-bold text-off-black mb-1.5"
                                >
                                    Start time
                                </label>
                                <input
                                    id="er-start"
                                    type="time"
                                    bind:value={startTime}
                                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-vibrant-pink focus:ring-2 focus:ring-vibrant-pink/30 focus:outline-none text-off-black bg-white"
                                />
                            </div>
                            <div>
                                <label
                                    for="er-end"
                                    class="block text-sm font-bold text-off-black mb-1.5"
                                >
                                    End time
                                </label>
                                <input
                                    id="er-end"
                                    type="time"
                                    bind:value={endTime}
                                    class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-vibrant-pink focus:ring-2 focus:ring-vibrant-pink/30 focus:outline-none text-off-black bg-white"
                                />
                            </div>
                        </div>
                        {#if showErrors && !timesInOrder}
                            <p class="text-sm font-semibold text-red-600">
                                The end time should be after the start time.
                            </p>
                        {/if}

                        <div>
                            <label
                                for="er-setup"
                                class="block text-sm font-bold text-off-black mb-1.5"
                            >
                                Set-up / clean-up times
                            </label>
                            <input
                                id="er-setup"
                                type="text"
                                bind:value={setupCleanup}
                                placeholder="e.g. In at 5 PM to set up, out by 9 PM"
                                class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-vibrant-pink focus:ring-2 focus:ring-vibrant-pink/30 focus:outline-none text-off-black"
                            />
                        </div>

                        <fieldset>
                            <legend
                                class="block text-sm font-bold text-off-black mb-1.5"
                            >
                                Event location
                                <span class="font-normal text-gray-400"
                                    >(check all that apply)</span
                                >
                            </legend>
                            <div class="grid gap-2.5 sm:grid-cols-2">
                                {#each LOCATION_OPTIONS as option}
                                    <label
                                        class="flex items-center gap-3 rounded-lg border border-gray-300 px-4 py-3 cursor-pointer select-none transition-colors has-[:checked]:border-vibrant-pink has-[:checked]:bg-vibrant-pink/5"
                                    >
                                        <input
                                            type="checkbox"
                                            value={option}
                                            bind:group={selectedLocations}
                                            class="h-5 w-5 flex-shrink-0 rounded border-gray-300 accent-vibrant-pink cursor-pointer"
                                        />
                                        <span
                                            class="font-body text-sm text-off-black"
                                            >{option}</span
                                        >
                                    </label>
                                {/each}
                                <label
                                    class="flex items-center gap-3 rounded-lg border border-gray-300 px-4 py-3 cursor-pointer select-none transition-colors has-[:checked]:border-vibrant-pink has-[:checked]:bg-vibrant-pink/5"
                                >
                                    <input
                                        type="checkbox"
                                        bind:checked={otherLocationChecked}
                                        class="h-5 w-5 flex-shrink-0 rounded border-gray-300 accent-vibrant-pink cursor-pointer"
                                    />
                                    <span class="font-body text-sm text-off-black"
                                        >Other</span
                                    >
                                </label>
                            </div>
                            {#if otherLocationChecked}
                                <input
                                    type="text"
                                    bind:value={locationOther}
                                    placeholder="Where will it be?"
                                    aria-label="Other event location"
                                    class="mt-3 w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-vibrant-pink focus:ring-2 focus:ring-vibrant-pink/30 focus:outline-none text-off-black"
                                />
                            {/if}
                        </fieldset>

                        <div>
                            <label
                                for="er-notes"
                                class="block text-sm font-bold text-off-black mb-1.5"
                            >
                                Is there anything else we should know?
                            </label>
                            <textarea
                                id="er-notes"
                                rows="4"
                                bind:value={notes}
                                placeholder="Special requests, equipment, expected guest count, anything helpful."
                                class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-vibrant-pink focus:ring-2 focus:ring-vibrant-pink/30 focus:outline-none text-off-black resize-y"
                            ></textarea>
                        </div>
                    </div>
                </div>

                <hr class="border-gray-100" />

                <!-- Acknowledgement + submit -->
                <div class="p-6 sm:p-7">
                    <label
                        class="flex items-start gap-3 cursor-pointer select-none"
                    >
                        <input
                            type="checkbox"
                            bind:checked={acknowledged}
                            class="mt-1 h-5 w-5 flex-shrink-0 rounded border-gray-300 accent-vibrant-pink cursor-pointer"
                        />
                        <span class="font-body text-sm leading-6 text-gray-600">
                            I understand this form is a request and does not
                            guarantee scheduling until confirmed by the LSP team.
                            <span class="text-vibrant-pink font-bold">*</span>
                        </span>
                    </label>
                    {#if showErrors && !acknowledged}
                        <p class="mt-2 text-sm font-semibold text-red-600">
                            Please check the box above to send your request.
                        </p>
                    {/if}

                    {#if submitError}
                        <div
                            class="mt-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                        >
                            {submitError}
                        </div>
                    {/if}

                    <button
                        type="submit"
                        disabled={saving}
                        class="mt-6 w-full px-6 py-4 bg-vibrant-pink text-white rounded-lg font-bold hover:bg-accent-gold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {saving ? "Sending your request..." : "Send request"}
                    </button>
                    <p class="mt-3 text-center font-body text-xs text-gray-400">
                        Goes straight to the LSP team. The earlier you submit,
                        the easier it is to coordinate.
                    </p>
                </div>
            </div>
        </form>
    {/if}
</div>
