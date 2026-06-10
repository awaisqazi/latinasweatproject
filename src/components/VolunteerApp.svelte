<script>
    import { onDestroy, onMount, tick } from "svelte";
    import {
        getSupabaseClient,
        SUPABASE_CONFIG_ERROR,
    } from "../lib/supabaseClient";
    import ShiftCard from "./ShiftCard.svelte";
    import MiniCalendar from "./MiniCalendar.svelte";
    import RegisterModal from "./RegisterModal.svelte";

    const supabase = SUPABASE_CONFIG_ERROR ? null : getSupabaseClient();

    let shifts = []; // Week shifts (legacy shape: start/end Dates)
    let opportunities = [];
    let shiftData = {}; // { [shiftId]: { registrations: [{name, role}] } }
    let selectedDate = new Date();
    let monthlyAvailability = {}; // { days: { 'YYYY-MM-DD': [...] } }
    let loadError = "";

    // Helper: Convert Date -> "YYYY-MM-DD" safely
    const toDateStr = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    // Helper: Get start of week (Sunday)
    const getStartOfWeek = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        d.setDate(diff);
        return d;
    };

    // Helper: Add days to a Date string
    const addDays = (dateStr, days) => {
        const [y, m, d] = dateStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        date.setDate(date.getDate() + days);
        return toDateStr(date);
    };

    // State is tracked by STRINGS to be browser-safe
    let currentWeekStartStr = toDateStr(getStartOfWeek(new Date()));

    let isModalOpen = false;
    let selectedShift = null;
    let selectedRole = "";
    let isSubmitting = false;
    let hideUnavailable = true;
    let registrationSuccess = false;
    let successTitle = "";
    let successMessage = "";
    let registerError = "";
    let canCancelRegistration = false;
    let isCancelling = false;

    // Fetch tracking
    let currentFetchKey = "";
    let currentMonthKey = "";
    let mounted = false;
    let realtimeChannel = null;
    let realtimeRefreshTimer = null;
    let realtimeMonthKeys = new Set();

    onMount(() => {
        mounted = true;

        if (!supabase) {
            loadError =
                "The shift schedule is temporarily unavailable. Please try again later.";
            return;
        }

        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        fetchMonthlyAvailability(monthKey);
        fetchOpportunities();
        startRealtime();
    });

    onDestroy(() => {
        if (realtimeRefreshTimer) {
            clearTimeout(realtimeRefreshTimer);
        }

        if (realtimeChannel) {
            supabase?.removeChannel(realtimeChannel);
            realtimeChannel = null;
        }
    });

    // Map a shifts_public row to the legacy shift shape used by ShiftCard.
    function mapShiftRow(row) {
        const start = new Date(row.starts_at);
        const end = new Date(row.ends_at);
        const date = new Date(start);
        date.setHours(0, 0, 0, 0);

        return {
            id: row.id,
            kind: row.kind,
            title: row.title,
            description: row.description,
            location: row.location,
            start,
            end,
            date,
            dateStr: toDateStr(date),
            leadCapacity: row.lead_capacity,
            volunteerCapacity: row.volunteer_capacity,
            leadCount: Number(row.lead_count) || 0,
            volunteerCount: Number(row.volunteer_count) || 0,
            cancelled: row.cancelled,
        };
    }

    function monthKeyForDate(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    }

    function queueRealtimeRefresh(payload = {}) {
        if (payload.starts_at) {
            const changedAt = new Date(payload.starts_at);
            if (!Number.isNaN(changedAt.getTime())) {
                realtimeMonthKeys.add(monthKeyForDate(changedAt));
            }
        }

        if (realtimeRefreshTimer) {
            clearTimeout(realtimeRefreshTimer);
        }

        realtimeRefreshTimer = setTimeout(() => {
            refreshAfterRealtime();
        }, 200);
    }

    function startRealtime() {
        if (!supabase || realtimeChannel) return;

        realtimeChannel = supabase
            .channel("volunteer-shifts")
            .on("broadcast", { event: "shift-changed" }, ({ payload }) => {
                queueRealtimeRefresh(payload);
            })
            .subscribe((status, error) => {
                if (status === "CHANNEL_ERROR") {
                    console.error("Volunteer realtime channel error:", error);
                }
            });
    }

    function broadcastShiftChange(shift, operation) {
        if (!realtimeChannel || !shift) return;

        realtimeChannel
            .send({
                type: "broadcast",
                event: "shift-changed",
                payload: {
                    shift_id: shift.id,
                    starts_at: shift.start?.toISOString?.() || null,
                    kind: shift.kind || null,
                    cancelled: Boolean(shift.cancelled),
                    operation,
                },
            })
            .catch((error) => {
                console.error("Volunteer realtime broadcast failed:", error);
            });
    }

    // Fetch availability data for the calendar (one RPC per month)
    async function fetchMonthlyAvailability(monthKey, { force = false } = {}) {
        if (!supabase || (!force && monthKey === currentMonthKey)) return;
        currentMonthKey = monthKey;

        const { data, error } = await supabase.rpc("get_month_availability", {
            p_month: monthKey,
        });

        if (error) {
            console.error("Error fetching monthly availability:", error);
            return;
        }

        monthlyAvailability = data || {};
    }

    // Handle month change from calendar navigation
    function handleMonthChange(event) {
        const newMonth = event.detail;
        const monthKey = `${newMonth.getFullYear()}-${String(newMonth.getMonth() + 1).padStart(2, "0")}`;
        fetchMonthlyAvailability(monthKey);
    }

    async function fetchOpportunities() {
        if (!supabase) return;

        const { data, error } = await supabase
            .from("shifts_public")
            .select("*")
            .eq("kind", "opportunity")
            .eq("cancelled", false)
            .gte("starts_at", new Date().toISOString())
            .order("starts_at", { ascending: true });

        if (error) {
            console.error("Error fetching opportunities:", error);
            return;
        }

        opportunities = (data || []).map(mapShiftRow);
        fetchRegistrants(opportunities.map((s) => s.id));
    }

    // Reactive fetch based on visible week
    $: if (mounted && supabase && currentWeekStartStr) {
        fetchWeek(currentWeekStartStr);
    }

    async function fetchWeek(weekStart) {
        if (weekStart === currentFetchKey) return;
        currentFetchKey = weekStart;

        const [y, m, d] = weekStart.split("-").map(Number);
        const rangeStart = new Date(y, m - 1, d);
        const rangeEnd = new Date(y, m - 1, d + 7);

        const { data, error } = await supabase
            .from("shifts_public")
            .select("*")
            .gte("starts_at", rangeStart.toISOString())
            .lt("starts_at", rangeEnd.toISOString())
            .eq("cancelled", false)
            .neq("kind", "opportunity")
            .order("starts_at", { ascending: true });

        if (weekStart !== currentFetchKey) return;

        if (error) {
            console.error("Error fetching shifts:", error);
            loadError =
                "Could not load shifts right now. Please refresh the page.";
            return;
        }

        loadError = "";
        shifts = (data || []).map(mapShiftRow);
        fetchRegistrants(shifts.map((s) => s.id));
    }

    // Fetch public registrant names (no emails or phone numbers)
    async function fetchRegistrants(shiftIds) {
        if (!supabase || !shiftIds.length) return;

        const { data, error } = await supabase
            .from("shift_registrations_public")
            .select("id, shift_id, name, role, checked_in")
            .in("shift_id", shiftIds);

        if (error) {
            console.error("Error fetching registrants:", error);
            return;
        }

        const next = { ...shiftData };
        for (const id of shiftIds) {
            next[id] = { registrations: [] };
        }
        for (const reg of data || []) {
            next[reg.shift_id].registrations.push(reg);
        }
        shiftData = next;
    }

    function refreshAfterRegistration() {
        currentFetchKey = "";
        fetchWeek(currentWeekStartStr);
        fetchOpportunities();
        currentMonthKey = "";
        const [y, m] = currentWeekStartStr.split("-");
        fetchMonthlyAvailability(`${y}-${m}`, { force: true });
    }

    function refreshAfterRealtime() {
        realtimeRefreshTimer = null;

        currentFetchKey = "";
        fetchWeek(currentWeekStartStr);
        fetchOpportunities();

        const monthKeys = realtimeMonthKeys;
        realtimeMonthKeys = new Set();

        if (currentMonthKey) {
            monthKeys.add(currentMonthKey);
        }

        if (monthKeys.size === 0) {
            const [y, m] = currentWeekStartStr.split("-");
            monthKeys.add(`${y}-${m}`);
        }

        for (const monthKey of monthKeys) {
            fetchMonthlyAvailability(monthKey, { force: true });
        }
    }

    function isShiftUnavailable(shift) {
        const data = shiftData[shift.id] || {};
        const now = new Date();
        const lockTime = new Date(shift.start.getTime() - 24 * 60 * 60 * 1000);
        const isLocked =
            now.getTime() >= lockTime.getTime() ||
            now.getTime() >= shift.start.getTime();

        if (isLocked) return true;

        const registrations = data.registrations || [];
        const leadCount = registrations.length
            ? registrations.filter((r) => r.role === "lead").length
            : shift.leadCount;
        const volunteerCount = registrations.length
            ? registrations.filter((r) => r.role === "volunteer").length
            : shift.volunteerCount;

        const isLeadFull = leadCount >= shift.leadCapacity;
        const isVolunteerFull = volunteerCount >= shift.volunteerCapacity;
        return isLeadFull && isVolunteerFull;
    }

    // Grouping by Safe String Keys
    $: shiftsByDate = shifts.reduce((acc, shift) => {
        if (hideUnavailable && isShiftUnavailable(shift)) return acc;
        const dateKey = shift.dateStr || toDateStr(shift.date);
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(shift);
        return acc;
    }, {});

    $: sortedDates = Object.keys(shiftsByDate).sort();

    // Filter by String Comparison
    $: visibleDates = sortedDates.filter((dateKey) => {
        const endOfWeekStr = addDays(currentWeekStartStr, 6);
        return dateKey >= currentWeekStartStr && dateKey <= endOfWeekStr;
    });

    // Display Title
    $: currentWeekDisplay = (() => {
        const [y, m, d] = currentWeekStartStr.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString();
    })();

    function nextWeek() {
        currentWeekStartStr = addDays(currentWeekStartStr, 7);
    }

    function prevWeek() {
        currentWeekStartStr = addDays(currentWeekStartStr, -7);
    }

    async function handleDateSelect(event) {
        const date = event.detail;
        const weekStart = getStartOfWeek(date);
        currentWeekStartStr = toDateStr(weekStart);

        await tick();

        const dateKey = toDateStr(date);
        const element = document.getElementById(`date-${dateKey}`);
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function openModal(event) {
        selectedShift = event.detail.shift;
        selectedRole = event.detail.role;
        isModalOpen = true;
        registrationSuccess = false;
        registerError = "";
        canCancelRegistration = false;
        successTitle = "";
        successMessage = "";
    }

    function openOpportunityModal(shift, role) {
        openModal({ detail: { shift, role } });
    }

    function isOpportunityLocked(shift) {
        return new Date() >= shift.start;
    }

    async function handleRegistration(event) {
        if (!supabase) return;

        isSubmitting = true;
        registerError = "";
        successTitle = "";
        successMessage = "";
        canCancelRegistration = false;
        const { name, email, phone, shift, role } = event.detail;

        const { data, error } = await supabase.rpc("register_for_shift", {
            p_shift_id: shift.id,
            p_name: name,
            p_email: email,
            p_phone: phone,
            p_role: role,
        });

        isSubmitting = false;

        if (error) {
            registerError =
                "Registration failed: " + (error.message || "please try again.");
            return;
        }

        if (data?.ok) {
            registrationSuccess = true;
            broadcastShiftChange(shift, "INSERT");
            refreshAfterRegistration();
            return;
        }

        const reason = data?.reason || "";

        if (reason === "duplicate") {
            successTitle = "Already Signed Up!";
            const dateStr = shift.start.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
            });
            const timeStr = shift.start.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
            });
            successMessage = `It looks like you are already signed up for this shift on ${dateStr} at ${timeStr}! We look forward to seeing you there.`;
            registrationSuccess = true;
            canCancelRegistration = true;
        } else if (reason === "full") {
            registerError =
                "This shift just filled up. Please pick another time.";
            refreshAfterRegistration();
        } else if (reason === "past") {
            registerError = "This shift has already started or ended.";
        } else if (reason === "cancelled") {
            registerError = "This shift has been cancelled.";
        } else if (reason === "not_found") {
            registerError = "This shift is no longer available.";
        } else if (reason === "invalid_input") {
            registerError =
                "Please double-check your name and email address and try again.";
        } else {
            registerError = "Registration failed. Please try again.";
        }
    }

    async function handleCancelRegistration(event) {
        if (!supabase) return;

        const { shift, email } = event.detail;
        if (!shift || !email) return;

        isCancelling = true;

        const { data, error } = await supabase.rpc(
            "cancel_shift_registration",
            {
                p_shift_id: shift.id,
                p_email: email,
            },
        );

        isCancelling = false;

        if (error || !data?.ok) {
            registerError =
                "We could not cancel that registration. Please contact us if you need help.";
            return;
        }

        canCancelRegistration = false;
        successTitle = "Registration Cancelled";
        successMessage =
            "Your spot has been released. We hope to see you at another shift soon!";
        broadcastShiftChange(shift, "DELETE");
        refreshAfterRegistration();
    }
</script>

<div class="max-w-7xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
    <div class="lg:w-1/3 xl:w-1/4">
        <div class="sticky top-24 space-y-6">
            <div class="bg-vibrant-pink rounded-2xl p-6 text-white shadow-xl">
                <h1 class="text-2xl font-bold font-rubik mb-2">
                    Volunteer Schedule
                </h1>
                <p class="opacity-90 text-sm">
                    Select a date to view available shifts and sign up.
                </p>
            </div>

            <MiniCalendar
                {shifts}
                {shiftData}
                {selectedDate}
                availabilityData={monthlyAvailability}
                on:select={handleDateSelect}
                on:monthChange={handleMonthChange}
            />

            <div
                class="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
            >
                <label class="flex items-center gap-3 cursor-pointer group">
                    <div class="relative">
                        <input
                            type="checkbox"
                            bind:checked={hideUnavailable}
                            class="sr-only peer"
                        />
                        <div
                            class="w-10 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-vibrant-pink/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-vibrant-pink"
                        ></div>
                    </div>
                    <span
                        class="text-sm font-medium text-gray-700 group-hover:text-gray-900"
                        >Hide Unavailable Shifts</span
                    >
                </label>
            </div>

            <div
                class="bg-blue-50 rounded-xl p-4 text-sm text-blue-800 shadow-sm"
            >
                <p class="font-bold mb-1">ℹ️ Note</p>
                <p>Registration closes 24 hours before each shift starts.</p>
            </div>
        </div>
    </div>

    <div class="flex-1 space-y-6">
        {#if loadError}
            <div
                class="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 text-center"
            >
                <p class="font-bold">Something went wrong</p>
                <p class="text-sm">{loadError}</p>
            </div>
        {/if}

        {#if opportunities.length > 0}
            <div
                class="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
            >
                <h2 class="text-xl font-bold text-gray-800 font-rubik mb-1">
                    Upcoming Volunteer Opportunities
                </h2>
                <p class="text-sm text-gray-500 mb-4">
                    One-off events that need extra hands, sign up below.
                </p>
                <div class="space-y-3">
                    {#each opportunities as opportunity (opportunity.id)}
                        {@const regs =
                            shiftData[opportunity.id]?.registrations || []}
                        {@const volCount = regs.length
                            ? regs.filter((r) => r.role === "volunteer").length
                            : opportunity.volunteerCount}
                        {@const leadCount = regs.length
                            ? regs.filter((r) => r.role === "lead").length
                            : opportunity.leadCount}
                        {@const volFull =
                            volCount >= opportunity.volunteerCapacity}
                        {@const leadFull =
                            leadCount >= opportunity.leadCapacity}
                        {@const locked = isOpportunityLocked(opportunity)}
                        <div
                            class="border border-gray-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/60"
                        >
                            <div>
                                <p class="font-bold text-gray-900 font-rubik">
                                    {opportunity.title ||
                                        "Volunteer Opportunity"}
                                </p>
                                <p class="text-sm text-gray-600 mt-0.5">
                                    {opportunity.start.toLocaleDateString(
                                        "en-US",
                                        {
                                            weekday: "long",
                                            month: "long",
                                            day: "numeric",
                                        },
                                    )} ·
                                    {opportunity.start.toLocaleTimeString(
                                        "en-US",
                                        {
                                            hour: "numeric",
                                            minute: "2-digit",
                                        },
                                    )} -
                                    {opportunity.end.toLocaleTimeString(
                                        "en-US",
                                        {
                                            hour: "numeric",
                                            minute: "2-digit",
                                        },
                                    )}
                                </p>
                                {#if opportunity.location}
                                    <p class="text-sm text-gray-600">
                                        📍 {opportunity.location}
                                    </p>
                                {/if}
                                {#if opportunity.description}
                                    <p class="text-sm text-gray-500 mt-1">
                                        {opportunity.description}
                                    </p>
                                {/if}
                                <p class="text-xs text-gray-500 mt-2">
                                    {volCount}/{opportunity.volunteerCapacity} volunteer
                                    spots filled
                                    {#if opportunity.leadCapacity > 0}
                                        · {leadCount}/{opportunity.leadCapacity}
                                        lead spots filled
                                    {/if}
                                </p>
                            </div>
                            <div class="flex gap-3 w-full md:w-auto">
                                {#if opportunity.leadCapacity > 0}
                                    <button
                                        class="flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border
                                        {locked || leadFull
                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                            : 'bg-off-black text-white border-off-black hover:bg-medium-gray hover:border-medium-gray hover:shadow-md'}"
                                        disabled={locked || leadFull}
                                        on:click={() =>
                                            openOpportunityModal(
                                                opportunity,
                                                "lead",
                                            )}
                                    >
                                        {leadFull ? "Lead Full" : "Lead"}
                                    </button>
                                {/if}
                                <button
                                    class="flex-1 md:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 border
                                    {locked || volFull
                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                        : 'bg-vibrant-pink text-white border-vibrant-pink hover:bg-accent-gold hover:border-accent-gold hover:shadow-md'}"
                                    disabled={locked || volFull}
                                    on:click={() =>
                                        openOpportunityModal(
                                            opportunity,
                                            "volunteer",
                                        )}
                                >
                                    {volFull ? "Full" : "Volunteer"}
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <div
            class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 sticky top-0 z-20"
        >
            <button
                type="button"
                on:click={prevWeek}
                class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors flex items-center gap-2 cursor-pointer"
            >
                &larr; Previous Week
            </button>
            <span class="font-bold text-gray-800 hidden md:block"
                >Week of {currentWeekDisplay}</span
            >
            <button
                type="button"
                on:click={nextWeek}
                class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors flex items-center gap-2 cursor-pointer"
            >
                Next Week &rarr;
            </button>
        </div>

        {#if visibleDates.length === 0}
            <div
                class="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-100"
            >
                <p class="text-lg">No shifts available for this week.</p>
                <p class="text-sm mt-2">Try navigating to a different week.</p>
            </div>
        {:else}
            {#each visibleDates as dateKey (dateKey)}
                <div id="date-{dateKey}" class="scroll-mt-32">
                    <h3
                        class="text-xl font-bold text-gray-800 mb-4 py-2 border-b border-gray-100"
                    >
                        {(() => {
                            const [y, m, d] = dateKey.split("-").map(Number);
                            return new Date(y, m - 1, d).toLocaleDateString(
                                "en-US",
                                {
                                    weekday: "long",
                                    month: "long",
                                    day: "numeric",
                                },
                            );
                        })()}
                    </h3>
                    <div class="space-y-3">
                        {#each shiftsByDate[dateKey] as shift (shift.id)}
                            <ShiftCard
                                {shift}
                                taken={shiftData[shift.id] || {
                                    lead: 0,
                                    volunteer: 0,
                                }}
                                on:signup={openModal}
                            />
                        {/each}
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>

<RegisterModal
    isOpen={isModalOpen}
    shift={selectedShift}
    role={selectedRole}
    {isSubmitting}
    success={registrationSuccess}
    {successTitle}
    {successMessage}
    errorMessage={registerError}
    canCancel={canCancelRegistration}
    {isCancelling}
    on:close={() => {
        isModalOpen = false;
        registrationSuccess = false;
        registerError = "";
        canCancelRegistration = false;
    }}
    on:submit={handleRegistration}
    on:cancelRegistration={handleCancelRegistration}
/>
