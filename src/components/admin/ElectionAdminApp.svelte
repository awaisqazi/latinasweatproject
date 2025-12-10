<script>
    import { onMount, onDestroy } from "svelte";
    import {
        subscribeToVotes,
        deleteVote,
        calculateTallies,
        getScheduledVotingStatus,
        subscribeToVotingPeriod,
        setVotingPeriodOverride,
    } from "../../lib/electionFirebase.js";

    let votes = [];
    let tallies = {};
    let loading = true;
    let error = "";
    let deleteError = "";
    let searchQuery = "";
    let filterAffiliation = "";
    let unsubscribe = null;
    let unsubscribeVotingPeriod = null;
    let isLive = false;

    // Voting period state
    let votingPeriodOverride = null; // null = auto, 'open', 'closed'
    let votingPeriodLoading = false;
    let scheduledStatus = getScheduledVotingStatus();

    // Role display names
    const roleDisplayNames = {
        secretary: "Secretary",
        treasurer: "Treasurer",
        vicePresident: "Vice President",
        president: "President",
    };

    onMount(() => {
        // Subscribe to real-time vote updates
        unsubscribe = subscribeToVotes((newVotes) => {
            votes = newVotes;
            // Calculate official tallies (exclude community members)
            const officialVotes = newVotes.filter(
                (v) => v.affiliation !== "community-member",
            );
            tallies = calculateTallies(officialVotes);
            loading = false;
            isLive = true;
        });

        // Subscribe to voting period settings
        unsubscribeVotingPeriod = subscribeToVotingPeriod((settings) => {
            votingPeriodOverride = settings.override;
        });
    });

    onDestroy(() => {
        // Clean up subscriptions when component is destroyed
        if (unsubscribe) {
            unsubscribe();
        }
        if (unsubscribeVotingPeriod) {
            unsubscribeVotingPeriod();
        }
    });
    // Delete modal state
    let showDeleteModal = false;
    let deleteTargetId = "";
    let deleteTargetName = "";
    let isBulkDelete = false;

    // Bulk selection state
    let selectedVotes = new Set();
    let showBulkDeleteModal = false;
    let bulkDeleteInProgress = false;

    function toggleVoteSelection(voteId) {
        if (selectedVotes.has(voteId)) {
            selectedVotes.delete(voteId);
        } else {
            selectedVotes.add(voteId);
        }
        selectedVotes = selectedVotes; // Trigger reactivity
    }

    function toggleSelectAll() {
        if (selectedVotes.size === filteredVotes.length) {
            selectedVotes = new Set();
        } else {
            selectedVotes = new Set(filteredVotes.map((v) => v.id));
        }
    }

    function clearSelection() {
        selectedVotes = new Set();
    }

    function openBulkDeleteModal() {
        if (selectedVotes.size === 0) return;
        showBulkDeleteModal = true;
    }

    function closeBulkDeleteModal() {
        showBulkDeleteModal = false;
    }

    async function confirmBulkDelete() {
        if (selectedVotes.size === 0) return;

        bulkDeleteInProgress = true;
        deleteError = "";

        const deletePromises = Array.from(selectedVotes).map((voteId) =>
            deleteVote(voteId),
        );
        const results = await Promise.all(deletePromises);

        const failedCount = results.filter((r) => !r.success).length;
        if (failedCount > 0) {
            deleteError = `Failed to delete ${failedCount} vote(s). Please try again.`;
        }

        selectedVotes = new Set();
        bulkDeleteInProgress = false;
        closeBulkDeleteModal();
    }

    function openDeleteModal(voteId, voterName) {
        deleteTargetId = voteId;
        deleteTargetName = voterName;
        isBulkDelete = false;
        showDeleteModal = true;
    }

    function closeDeleteModal() {
        showDeleteModal = false;
        deleteTargetId = "";
        deleteTargetName = "";
    }

    async function confirmDelete() {
        if (!deleteTargetId) return;

        deleteError = "";
        const result = await deleteVote(deleteTargetId);

        if (result.success) {
            // The real-time listener will update the votes automatically
            selectedVotes.delete(deleteTargetId);
            selectedVotes = selectedVotes;
        } else {
            deleteError = result.error || "Failed to delete vote.";
        }

        closeDeleteModal();
    }

    // Handle voting period toggle
    async function handleVotingPeriodChange(newOverride) {
        votingPeriodLoading = true;
        const result = await setVotingPeriodOverride(newOverride);
        if (!result.success) {
            console.error("Failed to update voting period:", result.error);
        }
        votingPeriodLoading = false;
    }

    // Get current effective voting status
    $: effectiveVotingStatus = (() => {
        if (votingPeriodOverride === "open")
            return { isOpen: true, label: "OPEN (Manual)", class: "open" };
        if (votingPeriodOverride === "closed")
            return { isOpen: false, label: "CLOSED (Manual)", class: "closed" };
        if (scheduledStatus.isOpen)
            return {
                isOpen: true,
                label: "OPEN (Scheduled)",
                class: "scheduled",
            };
        return {
            isOpen: false,
            label: "CLOSED (Scheduled)",
            class: "scheduled-closed",
        };
    })();

    // Filtered votes based on search and affiliation
    $: filteredVotes = votes.filter((vote) => {
        const matchesSearch =
            searchQuery === "" ||
            vote.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            vote.email?.toLowerCase().includes(searchQuery.toLowerCase());
        let matchesAffiliation;
        if (filterAffiliation === "") {
            matchesAffiliation = true;
        } else if (filterAffiliation === "official-only") {
            matchesAffiliation = vote.affiliation !== "community-member";
        } else {
            matchesAffiliation = vote.affiliation === filterAffiliation;
        }
        return matchesSearch && matchesAffiliation;
    });

    // Format timestamp
    function formatTime(timestamp) {
        if (!timestamp) return "N/A";
        try {
            const date = new Date(timestamp);
            return date.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
            });
        } catch {
            return "Invalid date";
        }
    }

    // Format affiliation
    function formatAffiliation(aff) {
        const map = {
            instructor: "Instructor",
            "ytt-student": "YTT Student",
            "board-member": "Board Member",
            "community-member": "Community Member",
        };
        return map[aff] || aff;
    }

    // Export to CSV
    function exportCSV() {
        const headers = [
            "Name",
            "Email",
            "Affiliation",
            "Secretary",
            "Treasurer",
            "Vice President",
            "President",
            "Submitted At",
        ];
        const rows = votes.map((v) => [
            v.name,
            v.email,
            formatAffiliation(v.affiliation),
            v.secretary,
            v.treasurer,
            v.vicePresident,
            v.president,
            v.submittedAtLocal || "",
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map((r) =>
                r
                    .map((cell) => `"${(cell || "").replace(/"/g, '""')}"`)
                    .join(","),
            ),
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `lsp-election-votes-${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }
</script>

<div class="admin-container">
    <!-- Header -->
    <header class="admin-header">
        <div class="header-content">
            <div>
                <h1>Election Admin Dashboard</h1>
                <p>LSP Junior Board Elections • Dec 9-10, 2025</p>
            </div>
            <div class="header-actions">
                {#if isLive}
                    <span class="live-indicator">
                        <span class="live-dot"></span>
                        LIVE
                    </span>
                {/if}
                <button
                    class="btn-primary"
                    on:click={exportCSV}
                    disabled={votes.length === 0}
                >
                    ↓ Export CSV
                </button>
            </div>
        </div>
    </header>

    {#if loading}
        <div class="loading-container">
            <div class="spinner"></div>
            <p>Loading votes...</p>
        </div>
    {:else if error}
        <div class="error-container">
            <p>{error}</p>
            <button on:click={loadVotes}>Try Again</button>
        </div>
    {:else}
        <!-- Voting Period Control -->
        <section class="voting-period-section">
            <div class="voting-period-card">
                <div class="voting-period-header">
                    <h2>🗳️ Voting Period Control</h2>
                    <span
                        class="voting-status-badge {effectiveVotingStatus.class}"
                    >
                        {effectiveVotingStatus.label}
                    </span>
                </div>
                <p class="voting-period-info">
                    Scheduled: Dec 9, 2025 12:00 AM – Dec 10, 2025 11:59 PM CST
                </p>
                <div
                    class="voting-toggle-group"
                    class:disabled={votingPeriodLoading}
                >
                    <button
                        class="voting-toggle-btn"
                        class:active={votingPeriodOverride === "open"}
                        on:click={() => handleVotingPeriodChange("open")}
                        disabled={votingPeriodLoading}
                    >
                        🟢 Open Now
                    </button>
                    <button
                        class="voting-toggle-btn auto"
                        class:active={votingPeriodOverride === null}
                        on:click={() => handleVotingPeriodChange(null)}
                        disabled={votingPeriodLoading}
                    >
                        ⏱️ Auto (Schedule)
                    </button>
                    <button
                        class="voting-toggle-btn"
                        class:active={votingPeriodOverride === "closed"}
                        on:click={() => handleVotingPeriodChange("closed")}
                        disabled={votingPeriodLoading}
                    >
                        🔴 Close Now
                    </button>
                </div>
                {#if votingPeriodLoading}
                    <p class="voting-loading">Updating...</p>
                {/if}
            </div>
        </section>

        <!-- Stats Overview -->
        <section class="stats-section">
            <div class="stats-grid">
                <div class="stat-card total">
                    <div class="stat-number">
                        {votes.filter(
                            (v) => v.affiliation !== "community-member",
                        ).length}
                    </div>
                    <div class="stat-label">Official Votes</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">
                        {votes.filter((v) => v.affiliation === "instructor")
                            .length}
                    </div>
                    <div class="stat-label">Instructors</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">
                        {votes.filter((v) => v.affiliation === "ytt-student")
                            .length}
                    </div>
                    <div class="stat-label">YTT Students</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">
                        {votes.filter((v) => v.affiliation === "board-member")
                            .length}
                    </div>
                    <div class="stat-label">Board Members</div>
                </div>
                <div class="stat-card community">
                    <div class="stat-number">
                        {votes.filter(
                            (v) => v.affiliation === "community-member",
                        ).length}
                    </div>
                    <div class="stat-label">Community (Advisory)</div>
                </div>
            </div>
        </section>

        <!-- Vote Tallies (Official Only) -->
        <section class="tallies-section">
            <h2>🗳️ Official Vote Tallies</h2>
            <p class="tallies-note">
                Includes votes from Instructors, YTT Students, and Board Members
                only.
            </p>
            <div class="tallies-grid">
                {#each Object.entries(roleDisplayNames) as [roleKey, roleTitle]}
                    {@const roleTotalVotes = Object.values(
                        tallies[roleKey] || {},
                    ).reduce((a, b) => a + b, 0)}
                    <div class="tally-card">
                        <h3>{roleTitle}</h3>
                        <div class="tally-list">
                            {#if tallies[roleKey] && Object.keys(tallies[roleKey]).length > 0}
                                {#each Object.entries(tallies[roleKey]).sort((a, b) => b[1] - a[1]) as [candidate, count], index}
                                    {@const percentage =
                                        roleTotalVotes > 0
                                            ? (
                                                  (count / roleTotalVotes) *
                                                  100
                                              ).toFixed(1)
                                            : 0}
                                    <div
                                        class="tally-row"
                                        class:leading={index === 0 && count > 0}
                                    >
                                        <div class="candidate-info">
                                            <span class="candidate-name"
                                                >{candidate}</span
                                            >
                                            {#if index === 0 && count > 0 && Object.keys(tallies[roleKey]).length > 1}
                                                <span class="leading-badge"
                                                    >LEADING</span
                                                >
                                            {/if}
                                        </div>
                                        <div class="tally-bar-container">
                                            <div
                                                class="tally-bar"
                                                style="width: {percentage}%"
                                            ></div>
                                        </div>
                                        <div class="tally-stats">
                                            <span class="tally-percentage"
                                                >{percentage}%</span
                                            >
                                            <span class="tally-count"
                                                >{count} vote{count !== 1
                                                    ? "s"
                                                    : ""}</span
                                            >
                                        </div>
                                    </div>
                                {/each}
                                <div class="total-votes-row">
                                    Total: {roleTotalVotes} vote{roleTotalVotes !==
                                    1
                                        ? "s"
                                        : ""} cast
                                </div>
                            {:else}
                                <p class="no-votes">No votes yet</p>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        </section>

        <!-- Community Popular Vote (Advisory) -->
        {@const communityVotes = votes.filter(
            (v) => v.affiliation === "community-member",
        )}
        {@const communityTallies = (() => {
            const roles = [
                "secretary",
                "treasurer",
                "vicePresident",
                "president",
            ];
            const t = {};
            roles.forEach((role) => (t[role] = {}));
            communityVotes.forEach((vote) => {
                roles.forEach((role) => {
                    const selection = vote[role];
                    if (selection)
                        t[role][selection] = (t[role][selection] || 0) + 1;
                });
            });
            return t;
        })()}
        <section class="tallies-section community-section">
            <h2>💜 Community Popular Vote</h2>
            <p class="tallies-note community-disclaimer">
                Advisory only — these votes do not count toward official
                election results. Showing pulse from {communityVotes.length} community
                member{communityVotes.length !== 1 ? "s" : ""}.
            </p>
            {#if communityVotes.length === 0}
                <div class="no-community-votes">
                    <p>No community votes have been submitted yet.</p>
                </div>
            {:else}
                <div class="tallies-grid">
                    {#each Object.entries(roleDisplayNames) as [roleKey, roleTitle]}
                        {@const roleTotalVotes = Object.values(
                            communityTallies[roleKey] || {},
                        ).reduce((a, b) => a + b, 0)}
                        <div class="tally-card community-card">
                            <h3>{roleTitle}</h3>
                            <div class="tally-list">
                                {#if communityTallies[roleKey] && Object.keys(communityTallies[roleKey]).length > 0}
                                    {#each Object.entries(communityTallies[roleKey]).sort((a, b) => b[1] - a[1]) as [candidate, count], index}
                                        {@const percentage =
                                            roleTotalVotes > 0
                                                ? (
                                                      (count / roleTotalVotes) *
                                                      100
                                                  ).toFixed(1)
                                                : 0}
                                        <div
                                            class="tally-row"
                                            class:leading={index === 0 &&
                                                count > 0}
                                        >
                                            <div class="candidate-info">
                                                <span class="candidate-name"
                                                    >{candidate}</span
                                                >
                                                {#if index === 0 && count > 0 && Object.keys(communityTallies[roleKey]).length > 1}
                                                    <span
                                                        class="leading-badge community-badge"
                                                        >POPULAR</span
                                                    >
                                                {/if}
                                            </div>
                                            <div
                                                class="tally-bar-container community-bar"
                                            >
                                                <div
                                                    class="tally-bar"
                                                    style="width: {percentage}%"
                                                ></div>
                                            </div>
                                            <div class="tally-stats">
                                                <span class="tally-percentage"
                                                    >{percentage}%</span
                                                >
                                                <span class="tally-count"
                                                    >{count} vote{count !== 1
                                                        ? "s"
                                                        : ""}</span
                                                >
                                            </div>
                                        </div>
                                    {/each}
                                    <div class="total-votes-row">
                                        Total: {roleTotalVotes} vote{roleTotalVotes !==
                                        1
                                            ? "s"
                                            : ""} cast
                                    </div>
                                {:else}
                                    <p class="no-votes">No votes yet</p>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </section>

        <!-- Voter List -->
        <section class="voters-section">
            <div class="voters-header">
                <h2>All Votes ({filteredVotes.length})</h2>
                <div class="filters">
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        bind:value={searchQuery}
                        class="search-input"
                    />
                    <select
                        bind:value={filterAffiliation}
                        class="filter-select"
                    >
                        <option value="">All Affiliations</option>
                        <option value="official-only"
                            >Official Only (No Community)</option
                        >
                        <option value="instructor">Instructors</option>
                        <option value="ytt-student">YTT Students</option>
                        <option value="board-member">Board Members</option>
                        <option value="community-member"
                            >Community Members</option
                        >
                    </select>
                </div>
            </div>

            {#if deleteError}
                <div class="delete-error">{deleteError}</div>
            {/if}

            <!-- Bulk Action Bar -->
            {#if selectedVotes.size > 0}
                <div class="bulk-action-bar">
                    <span class="selected-count">
                        {selectedVotes.size} vote{selectedVotes.size !== 1
                            ? "s"
                            : ""} selected
                    </span>
                    <div class="bulk-actions">
                        <button
                            class="bulk-btn clear"
                            on:click={clearSelection}
                        >
                            Clear Selection
                        </button>
                        <button
                            class="bulk-btn delete"
                            on:click={openBulkDeleteModal}
                        >
                            🗑️ Delete Selected
                        </button>
                    </div>
                </div>
            {/if}

            {#if filteredVotes.length === 0}
                <div class="no-results">
                    <p>No votes found matching your criteria.</p>
                </div>
            {:else}
                <div class="votes-table-container">
                    <table class="votes-table">
                        <thead>
                            <tr>
                                <th class="checkbox-col">
                                    <input
                                        type="checkbox"
                                        checked={selectedVotes.size ===
                                            filteredVotes.length &&
                                            filteredVotes.length > 0}
                                        on:change={toggleSelectAll}
                                        title="Select all"
                                    />
                                </th>
                                <th>Voter</th>
                                <th>Affiliation</th>
                                <th>Secretary</th>
                                <th>Treasurer</th>
                                <th>Vice President</th>
                                <th>President</th>
                                <th>Submitted</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each filteredVotes as vote}
                                <tr class:selected={selectedVotes.has(vote.id)}>
                                    <td class="checkbox-col">
                                        <input
                                            type="checkbox"
                                            checked={selectedVotes.has(vote.id)}
                                            on:change={() =>
                                                toggleVoteSelection(vote.id)}
                                        />
                                    </td>
                                    <td class="voter-cell">
                                        <div class="voter-name">
                                            {vote.name}
                                        </div>
                                        <div class="voter-email">
                                            {vote.email}
                                        </div>
                                    </td>
                                    <td>
                                        <span
                                            class="affiliation-badge {vote.affiliation}"
                                        >
                                            {formatAffiliation(
                                                vote.affiliation,
                                            )}
                                        </span>
                                    </td>
                                    <td>{vote.secretary || "-"}</td>
                                    <td>{vote.treasurer || "-"}</td>
                                    <td>{vote.vicePresident || "-"}</td>
                                    <td>{vote.president || "-"}</td>
                                    <td class="time-cell"
                                        >{formatTime(vote.submittedAtLocal)}</td
                                    >
                                    <td>
                                        <button
                                            class="delete-btn"
                                            on:click={() =>
                                                openDeleteModal(
                                                    vote.id,
                                                    vote.name,
                                                )}
                                            title="Delete this vote"
                                        >
                                            🗑️
                                        </button>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        </section>
    {/if}
</div>

{#if showDeleteModal}
    <div class="modal-overlay" on:click={closeDeleteModal}>
        <div class="modal-content" on:click|stopPropagation>
            <div class="modal-icon">⚠️</div>
            <h3>Delete Vote?</h3>
            <p>
                Are you sure you want to delete the vote from <strong
                    >{deleteTargetName}</strong
                >?
            </p>
            <p class="modal-warning">This action cannot be undone.</p>
            <div class="modal-actions">
                <button class="modal-btn cancel" on:click={closeDeleteModal}
                    >Cancel</button
                >
                <button class="modal-btn confirm" on:click={confirmDelete}
                    >Delete Vote</button
                >
            </div>
        </div>
    </div>
{/if}

{#if showBulkDeleteModal}
    <div class="modal-overlay" on:click={closeBulkDeleteModal}>
        <div class="modal-content" on:click|stopPropagation>
            <div class="modal-icon">⚠️</div>
            <h3>
                Delete {selectedVotes.size} Vote{selectedVotes.size !== 1
                    ? "s"
                    : ""}?
            </h3>
            <p>
                Are you sure you want to delete <strong
                    >{selectedVotes.size}</strong
                >
                selected vote{selectedVotes.size !== 1 ? "s" : ""}?
            </p>
            <p class="modal-warning">This action cannot be undone.</p>
            <div class="modal-actions">
                <button
                    class="modal-btn cancel"
                    on:click={closeBulkDeleteModal}
                    disabled={bulkDeleteInProgress}
                >
                    Cancel
                </button>
                <button
                    class="modal-btn confirm"
                    on:click={confirmBulkDelete}
                    disabled={bulkDeleteInProgress}
                >
                    {bulkDeleteInProgress
                        ? "Deleting..."
                        : `Delete ${selectedVotes.size} Vote${selectedVotes.size !== 1 ? "s" : ""}`}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .admin-container {
        min-height: 100vh;
        background: #f3f4f6;
    }

    /* Header */
    .admin-header {
        background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
        color: white;
        padding: 1.5rem 2rem;
        position: sticky;
        top: 0;
        z-index: 100;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .header-content {
        max-width: 1400px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
    }

    .admin-header h1 {
        font-size: 1.5rem;
        font-weight: 800;
        margin: 0;
    }

    .admin-header p {
        font-size: 0.875rem;
        opacity: 0.7;
        margin: 0.25rem 0 0;
    }

    .header-actions {
        display: flex;
        gap: 0.75rem;
        align-items: center;
    }

    .live-indicator {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        background: rgba(16, 185, 129, 0.2);
        color: #10b981;
        padding: 0.5rem 1rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.05em;
    }

    .live-dot {
        width: 8px;
        height: 8px;
        background: #10b981;
        border-radius: 50%;
        animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.5;
            transform: scale(1.2);
        }
    }

    /* Voting Period Control */
    .voting-period-section {
        max-width: 1400px;
        margin: 2rem auto 0;
        padding: 0 2rem;
    }

    .voting-period-card {
        background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
        padding: 1.5rem 2rem;
        border-radius: 1rem;
        color: white;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .voting-period-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
        margin-bottom: 0.5rem;
    }

    .voting-period-header h2 {
        font-size: 1.25rem;
        font-weight: 700;
        margin: 0;
    }

    .voting-status-badge {
        padding: 0.5rem 1rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .voting-status-badge.open {
        background: rgba(16, 185, 129, 0.2);
        color: #10b981;
    }

    .voting-status-badge.closed {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
    }

    .voting-status-badge.scheduled {
        background: rgba(59, 130, 246, 0.2);
        color: #3b82f6;
    }

    .voting-status-badge.scheduled-closed {
        background: rgba(156, 163, 175, 0.2);
        color: #9ca3af;
    }

    .voting-period-info {
        font-size: 0.875rem;
        color: rgba(255, 255, 255, 0.6);
        margin-bottom: 1rem;
    }

    .voting-toggle-group {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
    }

    .voting-toggle-group.disabled {
        opacity: 0.6;
        pointer-events: none;
    }

    .voting-toggle-btn {
        padding: 0.75rem 1.25rem;
        border-radius: 0.5rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        border: 2px solid rgba(255, 255, 255, 0.2);
        background: rgba(255, 255, 255, 0.05);
        color: white;
        font-size: 0.875rem;
    }

    .voting-toggle-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.4);
    }

    .voting-toggle-btn.active {
        background: #b5a18d;
        border-color: #b5a18d;
        color: white;
    }

    .voting-toggle-btn:disabled {
        cursor: not-allowed;
    }

    .voting-loading {
        margin-top: 0.75rem;
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.5);
    }

    .btn-primary,
    .btn-secondary {
        padding: 0.625rem 1.25rem;
        border-radius: 0.5rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
    }

    .btn-primary {
        background: #b5a18d;
        color: white;
    }

    .btn-primary:hover:not(:disabled) {
        background: #a08875;
    }

    .btn-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .btn-secondary:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.2);
    }

    .btn-primary:disabled,
    .btn-secondary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Loading */
    .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 4rem;
        color: #6b7280;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #e5e7eb;
        border-top-color: #b5a18d;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-bottom: 1rem;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* Error */
    .error-container {
        text-align: center;
        padding: 4rem;
        color: #dc2626;
    }

    .error-container button {
        margin-top: 1rem;
        padding: 0.5rem 1rem;
        background: #dc2626;
        color: white;
        border: none;
        border-radius: 0.375rem;
        cursor: pointer;
    }

    /* Stats Section */
    .stats-section {
        max-width: 1400px;
        margin: 2rem auto;
        padding: 0 2rem;
    }

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 1rem;
    }

    .stat-card {
        background: white;
        padding: 1.5rem;
        border-radius: 1rem;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }

    .stat-card.total {
        background: linear-gradient(135deg, #b5a18d 0%, #a08875 100%);
        color: white;
    }

    .stat-card.community {
        background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
        color: white;
    }

    .stat-number {
        font-size: 2.5rem;
        font-weight: 800;
        line-height: 1;
    }

    .stat-label {
        font-size: 0.875rem;
        opacity: 0.7;
        margin-top: 0.5rem;
    }

    /* Tallies Section */
    .tallies-section {
        max-width: 1400px;
        margin: 2rem auto;
        padding: 0 2rem;
    }

    .tallies-section h2 {
        font-size: 1.25rem;
        font-weight: 700;
        color: #1e1e1e;
        margin-bottom: 0.5rem;
    }

    .tallies-note {
        font-size: 0.875rem;
        color: #6b7280;
        margin-bottom: 1rem;
    }

    .community-section h2 {
        color: #7c3aed;
    }

    .community-disclaimer {
        color: #8b5cf6;
        font-style: italic;
    }

    .no-community-votes {
        text-align: center;
        padding: 2rem;
        background: #f5f3ff;
        border-radius: 0.75rem;
        color: #6b7280;
    }

    .community-card {
        border: 2px solid #c4b5fd;
    }

    .community-card h3 {
        color: #7c3aed !important;
        border-bottom-color: #c4b5fd !important;
    }

    .community-bar .tally-bar {
        background: linear-gradient(90deg, #8b5cf6, #7c3aed) !important;
    }

    .community-badge {
        background: linear-gradient(90deg, #8b5cf6, #7c3aed) !important;
    }

    .tallies-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1.5rem;
    }

    @media (max-width: 900px) {
        .tallies-grid {
            grid-template-columns: 1fr;
        }
    }

    .tally-card {
        background: white;
        padding: 1.5rem;
        border-radius: 1rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }

    .tally-card h3 {
        font-size: 1rem;
        font-weight: 700;
        color: #b5a18d;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #ffbd59;
    }

    .tally-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .tally-row {
        display: grid;
        grid-template-columns: 1fr 120px auto;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem;
        border-radius: 0.5rem;
        transition: background-color 0.2s;
    }

    .tally-row.leading {
        background: linear-gradient(
            135deg,
            rgba(181, 161, 141, 0.1) 0%,
            rgba(255, 189, 89, 0.1) 100%
        );
        border: 1px solid rgba(181, 161, 141, 0.3);
    }

    .candidate-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
    }

    .tally-row .candidate-name {
        font-size: 0.875rem;
        color: #374151;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .leading-badge {
        background: linear-gradient(135deg, #b5a18d 0%, #ffbd59 100%);
        color: white;
        font-size: 0.625rem;
        font-weight: 700;
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        flex-shrink: 0;
    }

    .tally-bar-container {
        background: #e5e7eb;
        border-radius: 9999px;
        height: 10px;
        overflow: hidden;
    }

    .tally-bar {
        background: linear-gradient(90deg, #b5a18d, #ffbd59);
        height: 100%;
        border-radius: 9999px;
        transition: width 0.5s ease;
    }

    .tally-stats {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        min-width: 70px;
    }

    .tally-percentage {
        font-size: 1rem;
        font-weight: 800;
        color: #1e1e1e;
    }

    .tally-count {
        font-size: 0.625rem;
        color: #6b7280;
        text-transform: uppercase;
    }

    .total-votes-row {
        margin-top: 0.75rem;
        padding-top: 0.75rem;
        border-top: 1px dashed #e5e7eb;
        font-size: 0.75rem;
        color: #6b7280;
        text-align: center;
        font-weight: 600;
    }

    .no-votes {
        font-size: 0.875rem;
        color: #9ca3af;
        font-style: italic;
    }

    /* Voters Section */
    .voters-section {
        max-width: 1400px;
        margin: 2rem auto;
        padding: 0 2rem 2rem;
    }

    .voters-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
        margin-bottom: 1rem;
    }

    .voters-header h2 {
        font-size: 1.25rem;
        font-weight: 700;
        color: #1e1e1e;
    }

    .filters {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
    }

    .search-input,
    .filter-select {
        padding: 0.625rem 1rem;
        border: 2px solid #e5e7eb;
        border-radius: 0.5rem;
        font-size: 0.875rem;
        transition: border-color 0.2s;
    }

    .search-input {
        min-width: 250px;
    }

    .search-input:focus,
    .filter-select:focus {
        outline: none;
        border-color: #b5a18d;
    }

    /* Bulk Action Bar */
    .bulk-action-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
        padding: 1rem 1.5rem;
        border-radius: 0.75rem;
        margin-bottom: 1rem;
        color: white;
    }

    .selected-count {
        font-weight: 600;
    }

    .bulk-actions {
        display: flex;
        gap: 0.75rem;
    }

    .bulk-btn {
        padding: 0.5rem 1rem;
        border-radius: 0.5rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
        font-size: 0.875rem;
    }

    .bulk-btn.clear {
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .bulk-btn.clear:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .bulk-btn.delete {
        background: #dc2626;
        color: white;
    }

    .bulk-btn.delete:hover {
        background: #b91c1c;
    }

    /* Checkbox Column */
    .checkbox-col {
        width: 40px;
        text-align: center;
    }

    .checkbox-col input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
        accent-color: #b5a18d;
    }

    .votes-table tbody tr.selected {
        background: rgba(181, 161, 141, 0.1);
    }

    .votes-table tbody tr.selected:hover {
        background: rgba(181, 161, 141, 0.15);
    }

    .delete-error {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #dc2626;
        padding: 0.75rem 1rem;
        border-radius: 0.5rem;
        margin-bottom: 1rem;
        font-size: 0.875rem;
    }

    .no-results {
        background: white;
        padding: 3rem;
        text-align: center;
        border-radius: 1rem;
        color: #6b7280;
    }

    /* Table */
    .votes-table-container {
        background: white;
        border-radius: 1rem;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    }

    .votes-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
    }

    .votes-table th {
        background: #f9fafb;
        padding: 1rem;
        text-align: left;
        font-weight: 600;
        color: #374151;
        border-bottom: 2px solid #e5e7eb;
        white-space: nowrap;
    }

    .votes-table td {
        padding: 1rem;
        border-bottom: 1px solid #e5e7eb;
        vertical-align: middle;
    }

    .votes-table tr:hover {
        background: #f9fafb;
    }

    .voter-cell {
        min-width: 200px;
    }

    .voter-name {
        font-weight: 600;
        color: #1e1e1e;
    }

    .voter-email {
        font-size: 0.75rem;
        color: #6b7280;
    }

    .affiliation-badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
    }

    .affiliation-badge.instructor {
        background: #dbeafe;
        color: #1d4ed8;
    }

    .affiliation-badge.ytt-student {
        background: #dcfce7;
        color: #16a34a;
    }

    .affiliation-badge.board-member {
        background: #fef3c7;
        color: #d97706;
    }

    .time-cell {
        white-space: nowrap;
        color: #6b7280;
    }

    .delete-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.5rem;
        border-radius: 0.375rem;
        transition: background 0.2s;
    }

    .delete-btn:hover {
        background: #fee2e2;
    }

    /* Delete Modal */
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(4px);
    }

    .modal-content {
        background: white;
        padding: 2rem;
        border-radius: 1rem;
        max-width: 400px;
        width: 90%;
        text-align: center;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
        animation: modalIn 0.2s ease-out;
    }

    @keyframes modalIn {
        from {
            opacity: 0;
            transform: scale(0.95);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }

    .modal-icon {
        font-size: 3rem;
        margin-bottom: 1rem;
    }

    .modal-content h3 {
        font-size: 1.5rem;
        font-weight: 700;
        color: #1e1e1e;
        margin-bottom: 0.5rem;
    }

    .modal-content p {
        color: #6b7280;
        margin-bottom: 0.5rem;
    }

    .modal-warning {
        color: #dc2626 !important;
        font-size: 0.875rem;
        font-weight: 600;
    }

    .modal-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
        margin-top: 1.5rem;
    }

    .modal-btn {
        padding: 0.75rem 1.5rem;
        border-radius: 0.5rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
    }

    .modal-btn.cancel {
        background: #e5e7eb;
        color: #374151;
    }

    .modal-btn.cancel:hover {
        background: #d1d5db;
    }

    .modal-btn.confirm {
        background: #dc2626;
        color: white;
    }

    .modal-btn.confirm:hover {
        background: #b91c1c;
    }
    /* Responsive */
    @media (max-width: 768px) {
        .header-content {
            flex-direction: column;
            align-items: flex-start;
        }

        .voters-header {
            flex-direction: column;
            align-items: flex-start;
        }

        .filters {
            width: 100%;
        }

        .search-input {
            width: 100%;
            min-width: unset;
        }

        .votes-table-container {
            overflow-x: auto;
        }

        .votes-table {
            min-width: 900px;
        }
    }
</style>
