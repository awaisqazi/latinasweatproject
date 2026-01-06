<script>
    import { onMount, tick } from "svelte";
    import { subsDb } from "../lib/subsFirebase";
    import {
        collection,
        onSnapshot,
        doc,
        addDoc,
        runTransaction,
        Timestamp,
    } from "firebase/firestore";
    import SubRequestCard from "./SubRequestCard.svelte";
    import SubVolunteerModal from "./SubVolunteerModal.svelte";
    import CreateSubRequestModal from "./CreateSubRequestModal.svelte";
    import SubsCalendar from "./SubsCalendar.svelte";

    let requests = [];
    let loading = true;
    let error = null;

    // Modal State
    let isModalOpen = false;
    let selectedRequest = null;
    let isSubmitting = false;
    let volunteerSuccess = false;

    // Create Request Modal State
    let isCreateModalOpen = false;
    let isCreatingRequest = false;

    // Week Navigation
    const toDateStr = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    const getStartOfWeek = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day;
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return d;
    };

    const addDays = (dateStr, days) => {
        const [y, m, d] = dateStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        date.setDate(date.getDate() + days);
        return toDateStr(date);
    };

    let currentWeekStartStr = toDateStr(getStartOfWeek(new Date()));

    // Filter options
    let showApprovedOnly = false;

    // Compute upcoming shifts needing subs (next 5 open/pending shifts in the future)
    $: upcomingShiftsNeedingSubs = (() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return requests
            .filter((req) => {
                const reqDate = new Date(req.date);
                reqDate.setHours(0, 0, 0, 0);
                return (
                    reqDate >= now &&
                    (req.status === "open" || req.status === "pending")
                );
            })
            .sort((a, b) => a.date - b.date)
            .slice(0, 5);
    })();

    onMount(() => {
        try {
            const unsubscribe = onSnapshot(
                collection(subsDb, "sub_requests"),
                (snapshot) => {
                    const data = [];
                    snapshot.forEach((docSnap) => {
                        const d = docSnap.data();
                        data.push({
                            id: docSnap.id,
                            ...d,
                            date: d.date?.toDate
                                ? d.date.toDate()
                                : new Date(d.date),
                            createdAt: d.createdAt?.toDate
                                ? d.createdAt.toDate()
                                : new Date(),
                        });
                    });
                    // Sort by date
                    data.sort((a, b) => a.date - b.date);
                    requests = data;
                    loading = false;
                },
                (err) => {
                    console.error("Firestore error:", err);
                    error = "Could not load sub requests.";
                    loading = false;
                },
            );

            return () => unsubscribe();
        } catch (e) {
            console.error("App Error:", e);
            error = e.message;
            loading = false;
        }
    });

    // Group by Date
    $: requestsByDate = requests.reduce((acc, req) => {
        // Filter based on toggle
        if (showApprovedOnly && req.status !== "approved") return acc;
        if (!showApprovedOnly && req.status === "approved") {
            // Still show approved requests in main view
        }

        const dateKey = toDateStr(req.date);
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(req);
        return acc;
    }, {});

    $: sortedDates = Object.keys(requestsByDate).sort();

    $: visibleDates = sortedDates.filter((dateKey) => {
        const endOfWeekStr = addDays(currentWeekStartStr, 6);
        return dateKey >= currentWeekStartStr && dateKey <= endOfWeekStr;
    });

    $: currentWeekDisplay = (() => {
        const [y, m, d] = currentWeekStartStr.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
        });
    })();

    function nextWeek() {
        currentWeekStartStr = addDays(currentWeekStartStr, 7);
    }

    function prevWeek() {
        currentWeekStartStr = addDays(currentWeekStartStr, -7);
    }

    // Calendar date selection
    let selectedDate = new Date();

    async function handleDateSelect(event) {
        const date = event.detail;
        selectedDate = date;
        const weekStart = getStartOfWeek(date);
        currentWeekStartStr = toDateStr(weekStart);

        await tick();

        const dateKey = toDateStr(date);
        const element = document.getElementById(`date-${dateKey}`);
        if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function openVolunteerModal(event) {
        selectedRequest = event.detail;
        isModalOpen = true;
        volunteerSuccess = false;
    }

    async function handleVolunteer(event) {
        isSubmitting = true;
        const { name, email, phone, request } = event.detail;

        try {
            const requestRef = doc(subsDb, "sub_requests", request.id);

            await runTransaction(subsDb, async (transaction) => {
                const reqDoc = await transaction.get(requestRef);
                if (!reqDoc.exists()) throw new Error("Request not found!");

                const data = reqDoc.data();
                const volunteers = data.volunteers || [];

                // Check for duplicate
                const isDuplicate = volunteers.some(
                    (v) => v.email.toLowerCase() === email.toLowerCase(),
                );
                if (isDuplicate) {
                    throw new Error(
                        "You have already volunteered for this class!",
                    );
                }

                volunteers.push({
                    name,
                    email,
                    phone,
                    timestamp: new Date().toISOString(),
                });

                transaction.update(requestRef, {
                    volunteers,
                    status: "pending",
                });
            });

            volunteerSuccess = true;
        } catch (e) {
            console.error("Volunteer failed:", e);
            alert("Failed to submit: " + e.message);
        } finally {
            isSubmitting = false;
        }
    }

    function formatDateHeader(dateKey) {
        const [y, m, d] = dateKey.split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
        });
    }

    // Create Request Success State
    let createSuccess = false;

    async function handleCreateRequest(event) {
        isCreatingRequest = true;
        const {
            className,
            instructorName,
            instructorEmail,
            date,
            time,
            duration,
            location,
            notes,
        } = event.detail;

        try {
            const [y, m, d] = date.split("-").map(Number);
            const [h, min] = time.split(":").map(Number);
            const dateObj = new Date(y, m - 1, d, h, min);

            await addDoc(collection(subsDb, "sub_requests"), {
                className,
                date: Timestamp.fromDate(dateObj),
                duration,
                location,
                notes,
                requestedBy: {
                    name: instructorName,
                    email: instructorEmail,
                },
                status: "open",
                volunteers: [],
                assignedSub: null,
                createdAt: Timestamp.now(),
            });

            createSuccess = true; // Show success view in modal
        } catch (e) {
            console.error("Create failed:", e);
            alert("Failed to submit request: " + e.message);
        } finally {
            isCreatingRequest = false;
        }
    }

    function handleCloseCreateModal() {
        isCreateModalOpen = false;
        createSuccess = false; // Reset success state when closing
    }
</script>

<div class="max-w-7xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
    <!-- Left Sidebar - Calendar & Controls -->
    <div class="lg:w-1/3 xl:w-1/4">
        <div class="sticky top-24 space-y-6">
            <!-- Header Card -->
            <div class="bg-vibrant-pink rounded-2xl p-6 text-white shadow-xl">
                <h1 class="text-2xl font-bold font-rubik mb-2">
                    Substitute Requests
                </h1>
                <p class="opacity-90 text-sm">
                    Help cover classes when instructors need a sub. Click a date
                    to view requests.
                </p>
                <button
                    on:click={() => (isCreateModalOpen = true)}
                    class="mt-4 w-full px-4 py-2 bg-white text-vibrant-pink rounded-lg font-bold hover:bg-gray-100 transition-colors shadow-lg cursor-pointer text-sm"
                >
                    + Request a Sub
                </button>
            </div>

            <!-- Calendar -->
            <SubsCalendar
                {requests}
                {selectedDate}
                on:select={handleDateSelect}
            />

            <!-- Filter Toggle -->
            <div
                class="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
            >
                <label class="flex items-center gap-3 cursor-pointer group">
                    <div class="relative">
                        <input
                            type="checkbox"
                            bind:checked={showApprovedOnly}
                            class="sr-only peer"
                        />
                        <div
                            class="w-10 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-vibrant-pink/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-vibrant-pink"
                        ></div>
                    </div>
                    <span
                        class="text-sm font-medium text-gray-700 group-hover:text-gray-900"
                    >
                        Show Confirmed Subs Only
                    </span>
                </label>
            </div>

            <!-- Info Note -->
            <div
                class="bg-blue-50 rounded-xl p-4 text-sm text-blue-800 shadow-sm"
            >
                <p class="font-bold mb-1">ℹ️ How it works</p>
                <p>
                    Volunteer to sub for a class, then wait for admin approval.
                    Once approved, you'll see calendar buttons.
                </p>
            </div>
        </div>
    </div>

    <!-- Main Content Area -->
    <div class="flex-1 space-y-6">
        <!-- Upcoming Shifts Needing Subs - Prominent Section -->
        {#if !loading && upcomingShiftsNeedingSubs.length > 0}
            <div
                class="bg-gradient-to-br from-vibrant-pink via-[#a08870] to-off-black rounded-2xl p-6 shadow-xl"
            >
                <div class="flex items-center gap-3 mb-4">
                    <div
                        class="bg-accent-gold/30 backdrop-blur-sm rounded-full p-2"
                    >
                        <svg
                            class="w-6 h-6 text-accent-gold"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            ></path>
                        </svg>
                    </div>
                    <div>
                        <h2 class="text-2xl font-bold text-white font-rubik">
                            Upcoming Shifts Needing Subs
                        </h2>
                        <p class="text-white/70 text-sm">
                            Help us fill these spots!
                        </p>
                    </div>
                </div>
                <div class="grid gap-4 md:grid-cols-2">
                    {#each upcomingShiftsNeedingSubs as request (request.id)}
                        <div
                            class="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-accent-gold/30 hover:bg-white/15 transition-colors"
                        >
                            <div class="flex justify-between items-start mb-2">
                                <span class="text-white font-bold text-lg"
                                    >{request.className}</span
                                >
                                <span
                                    class="text-xs font-medium px-2 py-1 rounded-full {request.status ===
                                    'open'
                                        ? 'bg-red-500/30 text-red-200'
                                        : 'bg-yellow-500/30 text-yellow-200'}"
                                >
                                    {request.status === "open"
                                        ? "Open"
                                        : "Pending"}
                                </span>
                            </div>
                            <div class="text-white/80 text-sm space-y-1 mb-3">
                                <p class="flex items-center gap-2">
                                    <svg
                                        class="w-4 h-4 text-accent-gold"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                        ></path>
                                    </svg>
                                    {new Date(request.date).toLocaleDateString(
                                        "en-US",
                                        {
                                            weekday: "short",
                                            month: "short",
                                            day: "numeric",
                                        },
                                    )}
                                </p>
                                <p class="flex items-center gap-2">
                                    <svg
                                        class="w-4 h-4 text-accent-gold"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                        ></path>
                                    </svg>
                                    {new Date(request.date).toLocaleTimeString(
                                        "en-US",
                                        { hour: "numeric", minute: "2-digit" },
                                    )}
                                </p>
                                <p class="flex items-center gap-2">
                                    <svg
                                        class="w-4 h-4 text-accent-gold"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                                        ></path>
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                                        ></path>
                                    </svg>
                                    {request.location}
                                </p>
                            </div>
                            <button
                                on:click={() => {
                                    selectedRequest = request;
                                    isModalOpen = true;
                                    volunteerSuccess = false;
                                }}
                                class="w-full py-2 px-4 bg-accent-gold text-off-black font-bold rounded-lg hover:bg-accent-gold/90 transition-colors cursor-pointer text-sm"
                            >
                                Volunteer to Sub
                            </button>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Week Navigation -->
        <div
            class="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 sticky top-0 z-20"
        >
            <button
                type="button"
                on:click={prevWeek}
                class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors flex items-center gap-2 cursor-pointer"
            >
                ← Previous Week
            </button>
            <span class="font-bold text-gray-800 hidden md:block">
                Week of {currentWeekDisplay}
            </span>
            <button
                type="button"
                on:click={nextWeek}
                class="px-4 py-2 rounded-lg text-gray-600 hover:bg-gray-100 font-medium transition-colors flex items-center gap-2 cursor-pointer"
            >
                Next Week →
            </button>
        </div>

        <!-- Loading State -->
        {#if loading}
            <div class="text-center py-12">
                <div
                    class="animate-spin h-8 w-8 border-4 border-vibrant-pink border-t-transparent rounded-full mx-auto"
                ></div>
                <p class="text-gray-500 mt-4">Loading requests...</p>
            </div>
        {:else if error}
            <div
                class="text-center py-12 text-red-600 bg-red-50 rounded-xl border border-red-100"
            >
                <p class="text-lg font-medium">{error}</p>
            </div>
        {:else if visibleDates.length === 0}
            <div
                class="text-center py-12 text-gray-500 bg-white rounded-xl border border-gray-100"
            >
                <p class="text-lg">No sub requests for this week.</p>
                <p class="text-sm mt-2">
                    Try navigating to a different week or use the calendar.
                </p>
            </div>
        {:else}
            <!-- Request List by Date -->
            {#each visibleDates as dateKey (dateKey)}
                <div id="date-{dateKey}" class="mb-8 scroll-mt-20">
                    <h3
                        class="text-xl font-bold text-gray-800 mb-4 py-2 border-b border-gray-100"
                    >
                        {formatDateHeader(dateKey)}
                    </h3>
                    <div class="grid gap-4 md:grid-cols-2">
                        {#each requestsByDate[dateKey] as request (request.id)}
                            <SubRequestCard
                                {request}
                                isAdmin={false}
                                on:volunteer={openVolunteerModal}
                            />
                        {/each}
                    </div>
                </div>
            {/each}
        {/if}
    </div>
</div>

<!-- Volunteer Modal -->
<SubVolunteerModal
    isOpen={isModalOpen}
    request={selectedRequest}
    {isSubmitting}
    success={volunteerSuccess}
    on:close={() => {
        isModalOpen = false;
        volunteerSuccess = false;
    }}
    on:submit={handleVolunteer}
/>

<!-- Create Request Modal -->
<CreateSubRequestModal
    isOpen={isCreateModalOpen}
    isSubmitting={isCreatingRequest}
    success={createSuccess}
    on:close={handleCloseCreateModal}
    on:submit={handleCreateRequest}
/>
