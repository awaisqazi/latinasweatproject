<script>
    import { createEventDispatcher } from "svelte";
    import {
        generateSubCalendarLink,
        generateSubICSFile,
    } from "../lib/subCalendarUtils";

    export let request;
    export let isAdmin = false;

    const dispatch = createEventDispatcher();

    function downloadICS() {
        const url = generateSubICSFile(request);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sub-${request.className.replace(/\s+/g, "-")}.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function formatDate(date) {
        return date.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
        });
    }

    function formatTime(date) {
        return date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
        });
    }

    function getStatusColor(status) {
        switch (status) {
            case "open":
                return "bg-amber-100 text-amber-800 border-amber-200";
            case "pending":
                return "bg-blue-100 text-blue-800 border-blue-200";
            case "approved":
                return "bg-green-100 text-green-800 border-green-200";
            default:
                return "bg-gray-100 text-gray-800 border-gray-200";
        }
    }

    function getStatusLabel(status) {
        switch (status) {
            case "open":
                return "Needs Sub";
            case "pending":
                return "Pending Approval";
            case "approved":
                return "Sub Confirmed";
            default:
                return status;
        }
    }
</script>

<div
    class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
>
    <!-- Header -->
    <div class="p-4 border-b border-gray-100">
        <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
                <h3 class="font-bold text-gray-900 text-lg truncate">
                    {request.className}
                </h3>
                <p class="text-sm text-gray-500 mt-1">
                    Requested by <span class="font-medium text-gray-700"
                        >{request.requestedBy?.name || "Unknown"}</span
                    >
                </p>
            </div>
            <span
                class="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border {getStatusColor(
                    request.status,
                )}"
            >
                {getStatusLabel(request.status)}
            </span>
        </div>
    </div>

    <!-- Body -->
    <div class="p-4 space-y-3">
        <div class="flex items-center gap-3 text-sm">
            <span class="text-lg">📅</span>
            <div>
                <p class="font-medium text-gray-900">
                    {formatDate(request.date)}
                </p>
                <p class="text-gray-500">
                    {formatTime(request.date)} •
                    {request.duration || 60} mins
                </p>
            </div>
        </div>

        {#if request.location}
            <div class="flex items-center gap-3 text-sm">
                <span class="text-lg">📍</span>
                <p class="text-gray-700">{request.location}</p>
            </div>
        {/if}

        {#if request.notes}
            <div class="flex items-start gap-3 text-sm">
                <span class="text-lg">📝</span>
                <p class="text-gray-600 italic">{request.notes}</p>
            </div>
        {/if}

        {#if request.status === "approved" && request.assignedSub}
            <div
                class="flex items-center gap-3 text-sm bg-green-50 rounded-lg p-3 border border-green-100"
            >
                <span class="text-lg">✅</span>
                <div>
                    <p class="font-medium text-green-800">
                        Sub: {request.assignedSub.name}
                    </p>
                    <p class="text-green-600 text-xs">
                        {request.assignedSub.email}
                    </p>
                </div>
            </div>
        {/if}

        {#if request.status === "pending" && request.volunteers?.length > 0}
            <div
                class="flex items-center gap-3 text-sm bg-blue-50 rounded-lg p-3 border border-blue-100"
            >
                <span class="text-lg">🙋</span>
                <div>
                    <p class="font-medium text-blue-800">
                        {request.volunteers.length} volunteer{request.volunteers
                            .length > 1
                            ? "s"
                            : ""} waiting
                    </p>
                    {#if isAdmin}
                        <p class="text-blue-600 text-xs">
                            {request.volunteers.map((v) => v.name).join(", ")}
                        </p>
                    {/if}
                </div>
            </div>
        {/if}
    </div>

    <!-- Footer Actions -->
    <div class="p-4 bg-gray-50 border-t border-gray-100">
        {#if isAdmin}
            <!-- Admin Actions -->
            <div class="flex flex-wrap gap-2">
                {#if request.status === "pending" && request.volunteers?.length > 0}
                    <button
                        on:click={() => dispatch("approve", request)}
                        class="px-4 py-2 bg-green-600 text-white rounded-lg font-medium text-sm hover:bg-green-700 transition-colors cursor-pointer"
                    >
                        Approve Sub
                    </button>
                    <button
                        on:click={() => dispatch("reject", request)}
                        class="px-4 py-2 bg-red-100 text-red-700 rounded-lg font-medium text-sm hover:bg-red-200 transition-colors cursor-pointer"
                    >
                        Reject
                    </button>
                {/if}
                <button
                    on:click={() => dispatch("assign", request)}
                    class="px-4 py-2 bg-vibrant-pink text-white rounded-lg font-medium text-sm hover:bg-accent-gold transition-colors cursor-pointer"
                >
                    Assign Sub
                </button>
                <button
                    on:click={() => dispatch("edit", request)}
                    class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-300 transition-colors cursor-pointer"
                >
                    Edit
                </button>
                <button
                    on:click={() => dispatch("delete", request)}
                    class="px-4 py-2 text-red-600 hover:text-red-800 font-medium text-sm transition-colors cursor-pointer"
                >
                    Delete
                </button>
            </div>
        {:else}
            <!-- Public Actions -->
            {#if request.status === "open"}
                <button
                    on:click={() => dispatch("volunteer", request)}
                    class="w-full px-4 py-3 bg-vibrant-pink text-white rounded-lg font-bold hover:bg-accent-gold transition-colors cursor-pointer"
                >
                    Volunteer to Sub
                </button>
            {:else if request.status === "pending"}
                <p class="text-center text-blue-600 font-medium text-sm">
                    ⏳ Awaiting Admin Approval
                </p>
            {:else if request.status === "approved"}
                <div class="space-y-3">
                    <p class="text-center text-green-600 font-medium text-sm">
                        ✅ Sub Confirmed
                    </p>
                    <!-- Calendar Buttons -->
                    <div class="flex gap-2">
                        <a
                            href={generateSubCalendarLink(request)}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all font-medium text-gray-700 text-sm shadow-sm"
                        >
                            <svg
                                class="w-4 h-4"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <path
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    fill="#4285F4"
                                />
                                <path
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    fill="#34A853"
                                />
                                <path
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    fill="#FBBC05"
                                />
                                <path
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    fill="#EA4335"
                                />
                            </svg>
                            Google
                        </a>
                        <button
                            on:click={downloadICS}
                            class="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all font-medium text-gray-700 text-sm shadow-sm cursor-pointer"
                        >
                            <svg
                                class="w-4 h-4 text-gray-800"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <path
                                    d="M18.71 19.5C17.88 20.74 17 21.95 15.66 21.97C14.32 22 13.89 21.18 12.37 21.18C10.84 21.18 10.37 21.95 9.09997 22C7.78997 22.05 6.79997 20.68 5.95997 19.47C4.24997 17 2.93997 12.45 4.69997 9.39C5.56997 7.87 7.12997 6.91 8.81997 6.88C10.1 6.86 11.32 7.75 12.11 7.75C12.89 7.75 14.37 6.68 15.92 6.84C16.57 6.87 18.39 7.1 19.56 8.82C19.47 8.88 17.39 10.1 17.41 12.63C17.44 15.65 20.06 16.66 20.09 16.67C20.06 16.74 19.67 18.11 18.71 19.5ZM13 3.5C13.73 2.67 14.94 2.04 15.94 2C16.07 3.17 15.6 4.35 14.9 5.19C14.21 6.04 13.07 6.7 11.95 6.61C11.8 5.46 12.36 4.26 13 3.5Z"
                                />
                            </svg>
                            Apple
                        </button>
                    </div>
                </div>
            {/if}
        {/if}
    </div>
</div>
