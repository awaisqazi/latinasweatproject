<script>
    import { onMount } from "svelte";
    import {
        getSupabaseClient,
        SUPABASE_CONFIG_ERROR,
    } from "../lib/supabaseClient";
    import CheckInModal from "./CheckInModal.svelte";

    const supabase = SUPABASE_CONFIG_ERROR ? null : getSupabaseClient();

    let kioskCode = "";
    let missingCode = false;
    let invalidCode = false;

    let shifts = []; // Today's shifts with their registrations
    let loading = true;
    let error = null;

    // Collapsible State
    let expandedShiftIds = new Set();
    let hideInactive = true;

    // Modal State
    let showModal = false;
    let selectedVolunteer = null;
    let selectedShift = null;
    let isProcessing = false;

    onMount(() => {
        const params = new URLSearchParams(window.location.search);
        kioskCode = params.get("code") || "";

        if (!kioskCode) {
            missingCode = true;
            loading = false;
            return;
        }

        if (!supabase) {
            error = "Check-in is temporarily unavailable. Please ask an admin for help.";
            loading = false;
            return;
        }

        loadToday();
    });

    async function loadToday() {
        loading = true;
        error = null;

        const now = new Date();
        const dayStart = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
        );
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const { data: shiftRows, error: shiftError } = await supabase
            .from("shifts_public")
            .select("*")
            .gte("starts_at", dayStart.toISOString())
            .lt("starts_at", dayEnd.toISOString())
            .eq("cancelled", false)
            .order("starts_at", { ascending: true });

        if (shiftError) {
            error = "Could not load today's shifts. Please refresh.";
            loading = false;
            return;
        }

        let registrationsByShift = {};
        const ids = (shiftRows || []).map((s) => s.id);
        if (ids.length) {
            const { data: regs, error: regError } = await supabase.rpc(
                "get_shift_check_in_registrations",
                {
                    p_code: kioskCode,
                    p_shift_ids: ids,
                },
            );

            if (regError) {
                if (regError.code === "42501") {
                    invalidCode = true;
                    loading = false;
                    return;
                }

                error = "Could not load registrations. Please refresh.";
                loading = false;
                return;
            }

            for (const reg of regs || []) {
                if (!registrationsByShift[reg.shift_id]) {
                    registrationsByShift[reg.shift_id] = [];
                }
                registrationsByShift[reg.shift_id].push(reg);
            }
        }

        shifts = (shiftRows || []).map((row) => ({
            id: row.id,
            kind: row.kind,
            title: row.title,
            start: new Date(row.starts_at),
            end: new Date(row.ends_at),
            registrations: registrationsByShift[row.id] || [],
        }));

        loading = false;
    }

    // Check if shift is ended
    function isShiftEnded(shift) {
        return new Date() > shift.end;
    }

    $: visibleShifts = shifts.filter((shift) => {
        if (!hideInactive) return true;
        return !isShiftEnded(shift) && shift.registrations.length > 0;
    });

    $: todayDisplay = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
    });

    // Toggle Collapsible
    function toggleShift(shiftId) {
        if (expandedShiftIds.has(shiftId)) {
            expandedShiftIds.delete(shiftId);
        } else {
            expandedShiftIds.add(shiftId);
        }
        expandedShiftIds = new Set(expandedShiftIds);
    }

    function handleCheckInClick(shift, volunteer) {
        selectedShift = shift;
        selectedVolunteer = volunteer;
        showModal = true;
    }

    async function confirmCheckIn() {
        if (!selectedShift || !selectedVolunteer || isProcessing) return;

        isProcessing = true;

        const { data, error: rpcError } = await supabase.rpc(
            "set_shift_check_in",
            {
                p_registration_id: selectedVolunteer.id,
                p_checked_in: true,
                p_code: kioskCode,
            },
        );

        isProcessing = false;
        showModal = false;

        if (rpcError) {
            error = "Check-in failed. Please try again.";
            return;
        }

        if (!data?.ok) {
            if (data?.reason === "invalid_code") {
                invalidCode = true;
            } else {
                error = "Check-in failed. Please refresh and try again.";
            }
            return;
        }

        // Update local state
        shifts = shifts.map((shift) => {
            if (shift.id !== selectedShift.id) return shift;
            return {
                ...shift,
                registrations: shift.registrations.map((reg) =>
                    reg.id === selectedVolunteer.id
                        ? { ...reg, checked_in: true }
                        : reg,
                ),
            };
        });
        selectedShift = null;
        selectedVolunteer = null;
    }
</script>

<div class="max-w-3xl mx-auto px-4 py-8 space-y-6">
    <div class="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h1 class="text-2xl font-bold font-rubik text-gray-900 mb-2">
            Volunteer Check-in
        </h1>
        <p class="text-gray-500 text-sm">
            {todayDisplay} · Tap your shift below, find your name, and check in.
        </p>
    </div>

    {#if missingCode || invalidCode}
        <div
            class="bg-amber-50 text-amber-800 p-6 rounded-xl border border-amber-200 text-center"
        >
            <p class="font-bold text-lg">Kiosk link not active</p>
            <p class="text-sm mt-2">
                This kiosk link is missing its access code, ask an admin for
                the current link.
            </p>
        </div>
    {:else if error}
        <div
            class="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-center"
        >
            <p class="font-bold">Something went wrong</p>
            <p class="text-sm">{error}</p>
        </div>
    {:else if loading}
        <div class="text-center py-12">
            <div
                class="animate-spin rounded-full h-12 w-12 border-b-2 border-vibrant-pink mx-auto"
            ></div>
            <p class="mt-4 text-gray-500">Loading shifts...</p>
        </div>
    {:else}
        <!-- Filter Toggle -->
        <div
            class="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center justify-between"
        >
            <span class="text-sm font-medium text-gray-700"
                >Hide ended and empty shifts</span
            >
            <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-vibrant-pink focus:ring-offset-2 {hideInactive
                    ? 'bg-vibrant-pink'
                    : 'bg-gray-200'}"
                on:click={() => (hideInactive = !hideInactive)}
                role="switch"
                aria-checked={hideInactive}
            >
                <span class="sr-only">Hide inactive shifts</span>
                <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {hideInactive
                        ? 'translate-x-6'
                        : 'translate-x-1'}"
                ></span>
            </button>
        </div>

        {#if visibleShifts.length === 0}
            <div
                class="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-100"
            >
                <p class="text-lg">
                    {hideInactive
                        ? "No shifts to check in to right now."
                        : "No shifts scheduled for today."}
                </p>
            </div>
        {:else}
            <div class="space-y-4">
                {#each visibleShifts as shift (shift.id)}
                    {@const isEnded = isShiftEnded(shift)}
                    {@const isExpanded = expandedShiftIds.has(shift.id)}

                    <div
                        class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-all duration-200 {isExpanded
                            ? 'ring-2 ring-vibrant-pink/10'
                            : ''}"
                    >
                        <!-- Header (Click to Toggle) -->
                        <button
                            on:click={() => toggleShift(shift.id)}
                            class="w-full text-left bg-gray-50 p-4 border-b border-gray-100 flex justify-between items-center gap-4 hover:bg-gray-100 transition-colors"
                        >
                            <div>
                                <div class="flex items-center gap-3">
                                    <p class="text-lg font-bold text-gray-900">
                                        {shift.start.toLocaleTimeString(
                                            "en-US",
                                            {
                                                hour: "numeric",
                                                minute: "2-digit",
                                            },
                                        )} -
                                        {shift.end.toLocaleTimeString("en-US", {
                                            hour: "numeric",
                                            minute: "2-digit",
                                        })}
                                    </p>
                                    {#if isEnded}
                                        <span
                                            class="px-2 py-0.5 rounded text-xs font-bold bg-gray-200 text-gray-600"
                                            >Ended</span
                                        >
                                    {/if}
                                </div>
                                {#if shift.title}
                                    <p
                                        class="text-sm font-medium text-gray-700 mt-0.5"
                                    >
                                        {shift.title}
                                    </p>
                                {/if}
                                <p class="text-sm text-gray-500 mt-1">
                                    {shift.registrations.length} Volunteer{shift
                                        .registrations.length !== 1
                                        ? "s"
                                        : ""}
                                </p>
                            </div>
                            <div
                                class="text-gray-400 transform transition-transform duration-200 {isExpanded
                                    ? 'rotate-180'
                                    : ''}"
                            >
                                <svg
                                    class="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    ><path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M19 9l-7 7-7-7"
                                    ></path></svg
                                >
                            </div>
                        </button>

                        <!-- Body (Collapsible) -->
                        {#if isExpanded}
                            <div class="divide-y divide-gray-100">
                                {#if shift.registrations.length === 0}
                                    <div
                                        class="p-8 text-center text-gray-400 italic"
                                    >
                                        No volunteers registered for this
                                        shift.
                                    </div>
                                {:else}
                                    {#each shift.registrations as reg (reg.id)}
                                        <div
                                            class="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                                        >
                                            <div class="flex-1">
                                                <div
                                                    class="flex items-center gap-2"
                                                >
                                                    <h4
                                                        class="font-bold text-gray-900"
                                                    >
                                                        {reg.name}
                                                    </h4>
                                                    <span
                                                        class="text-xs px-2 py-0.5 rounded-full font-medium {reg.role ===
                                                        'lead'
                                                            ? 'bg-purple-100 text-purple-700'
                                                            : 'bg-pink-100 text-pink-700'}"
                                                    >
                                                        {reg.role === "lead"
                                                            ? "Lead"
                                                            : "Volunteer"}
                                                    </span>
                                                </div>
                                            </div>

                                            <div>
                                                {#if reg.checked_in}
                                                    <span
                                                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
                                                    >
                                                        <svg
                                                            class="w-4 h-4"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                            ><path
                                                                stroke-linecap="round"
                                                                stroke-linejoin="round"
                                                                stroke-width="2"
                                                                d="M5 13l4 4L19 7"
                                                            ></path></svg
                                                        >
                                                        Checked In
                                                    </span>
                                                {:else}
                                                    <button
                                                        on:click={() =>
                                                            handleCheckInClick(
                                                                shift,
                                                                reg,
                                                            )}
                                                        disabled={isEnded ||
                                                            isProcessing}
                                                        class="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed {isEnded
                                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none'
                                                            : 'bg-vibrant-pink hover:bg-pink-600 text-white hover:shadow-lg focus:ring-pink-200'}"
                                                    >
                                                        {isEnded
                                                            ? "Ended"
                                                            : "Check In"}
                                                    </button>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}

        <div class="bg-blue-50 rounded-xl p-4 text-sm text-blue-800 shadow-sm">
            <p class="font-bold mb-1">ℹ️ Note</p>
            <p>Check-in is disabled after the shift ends.</p>
        </div>
    {/if}
</div>

<CheckInModal
    isOpen={showModal}
    volunteerName={selectedVolunteer ? selectedVolunteer.name : ""}
    shiftDate={selectedShift
        ? selectedShift.start.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
          })
        : ""}
    shiftTime={selectedShift
        ? `${selectedShift.start.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
          })} - ${selectedShift.end.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
          })}`
        : ""}
    on:confirm={confirmCheckIn}
    on:cancel={() => (showModal = false)}
/>
