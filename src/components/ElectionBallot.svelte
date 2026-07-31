<script>
    import { onMount, onDestroy } from "svelte";
    import {
        supabase,
        SUPABASE_CONFIG_ERROR,
    } from "../lib/supabaseClient.js";
    import { candidateKey, electionLivestream } from "../data/elections2026.js";

    // Props - candidate data passed from parent
    export let roles = [];

    // Ballot section order, unchanged since the 2025 election.
    const BALLOT_ORDER = [
        "secretary",
        "treasurer",
        "vice-president",
        "president",
    ];

    // Voting period status
    let votingStatus = {
        isOpen: false,
        message: "Loading voting status...",
        status: "loading",
    };
    let votingStatusLoading = true;
    let votingStatusError = false;
    let statusPollInterval = null;

    // Schedule details from the server (for the closed-state schedule box)
    let opensAt = null;
    let closesAt = null;

    // Form state
    let voterName = "";
    let voterEmail = "";
    let voterAffiliation = "";

    // Vote selections (keyed by role id)
    let selections = {
        secretary: "",
        treasurer: "",
        "vice-president": "",
        president: "",
    };

    // Speech acknowledgments, keyed by candidateKey(roleId, name). Every
    // candidate must be checked off before the selections unlock.
    let speechAck = {};

    // Form submission state
    let isSubmitting = false;
    let submitError = "";
    let submitSuccess = false;
    let hasVotedBefore = false;

    // Affiliation options
    const affiliations = [
        { value: "instructor", label: "LSP Instructor" },
        { value: "ytt-student", label: "YTT Student" },
        { value: "board-member", label: "Board Member" },
        { value: "community-member", label: "Community Member" },
    ];

    function formatDateTime(iso) {
        if (!iso) return "";
        return new Intl.DateTimeFormat("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            timeZoneName: "short",
        }).format(new Date(iso));
    }

    // Fetch the effective voting status from the server (RPC handles the
    // schedule and any admin override).
    async function fetchVotingStatus() {
        if (!supabase) {
            console.error(SUPABASE_CONFIG_ERROR);
            votingStatus = {
                isOpen: false,
                message:
                    "We could not check the voting status. Please try again later.",
                status: "error",
            };
            votingStatusLoading = false;
            votingStatusError = true;
            return;
        }

        const { data, error } = await supabase.rpc("get_voting_status");

        if (error) {
            console.error("Error fetching voting status:", error.message);
            votingStatus = {
                isOpen: false,
                message:
                    "We could not check the voting status. Please try again.",
                status: "error",
            };
            votingStatusLoading = false;
            votingStatusError = true;
            return;
        }

        opensAt = data?.opensAt || null;
        closesAt = data?.closesAt || null;

        if (data?.open) {
            votingStatus = {
                isOpen: true,
                message: closesAt
                    ? `Voting is open until ${formatDateTime(closesAt)}.`
                    : "Voting is open.",
                status: "open",
            };
        } else if (opensAt && new Date(opensAt) > new Date()) {
            votingStatus = {
                isOpen: false,
                message: `Voting opens on ${formatDateTime(opensAt)}.`,
                status: "before-period",
            };
        } else {
            votingStatus = {
                isOpen: false,
                message:
                    "Voting is currently closed. Please check back later.",
                status: "closed",
            };
        }

        votingStatusLoading = false;
        votingStatusError = false;
    }

    onMount(() => {
        fetchVotingStatus();
        // Poll periodically so the page reacts when the board opens or
        // closes voting (replaces the old realtime listener).
        statusPollInterval = setInterval(fetchVotingStatus, 60000);
    });

    onDestroy(() => {
        if (statusPollInterval) {
            clearInterval(statusPollInterval);
        }
    });

    // Retry function for manual refresh
    async function retryVotingStatus() {
        votingStatusLoading = true;
        votingStatusError = false;
        await fetchVotingStatus();
    }

    // Check if email has voted when email changes
    async function checkEmail() {
        if (!supabase) return;
        if (voterEmail && voterEmail.includes("@")) {
            const { data, error } = await supabase.rpc("has_voted", {
                p_email: voterEmail.trim(),
            });
            if (error) {
                console.error("Error checking email:", error.message);
                return;
            }
            hasVotedBefore = data === true;
        }
    }

    // Flat list of every candidate on the ballot, in ballot order, each with
    // its role and its acknowledgment key. Derived from the roles prop so the
    // data file stays the single source of truth.
    // NOTE (Svelte legacy mode): keep these reads inline in the reactive
    // statements. State read inside a separate helper function is not tracked.
    $: ballotRoles = BALLOT_ORDER.map((roleId) => {
        const role = roles.find((r) => r.id === roleId);
        return {
            id: roleId,
            title: role ? role.title : formatRoleTitle(roleId),
            candidates: (role ? role.candidates : []).map((candidate) => ({
                ...candidate,
                roleId,
                key: candidateKey(roleId, candidate.name),
            })),
        };
    });

    $: allCandidates = ballotRoles.flatMap((role) => role.candidates);
    $: totalSpeeches = allCandidates.length;
    $: acknowledgedCount = allCandidates.reduce(
        (count, candidate) => count + (speechAck[candidate.key] ? 1 : 0),
        0,
    );
    $: allSpeechesAcknowledged =
        totalSpeeches > 0 && acknowledgedCount === totalSpeeches;

    // Reassign rather than mutate so the derived counts above stay reactive.
    function toggleSpeech(key, checked) {
        speechAck = { ...speechAck, [key]: checked };
    }

    // Form validation
    $: isFormValid =
        voterName.trim() !== "" &&
        voterEmail.trim() !== "" &&
        voterEmail.includes("@") &&
        voterAffiliation !== "" &&
        allSpeechesAcknowledged &&
        !hasVotedBefore;

    // Handle form submission
    async function handleSubmit(event) {
        event.preventDefault();

        if (!isFormValid || isSubmitting) return;

        if (!supabase) {
            submitError =
                "Voting is unavailable right now. Please try again later.";
            return;
        }

        isSubmitting = true;
        submitError = "";

        const { data, error } = await supabase.rpc("cast_vote", {
            p_email: voterEmail.trim(),
            p_name: voterName.trim(),
            p_affiliation: voterAffiliation,
            p_president: selections.president || "abstain",
            p_vice_president: selections["vice-president"] || "abstain",
            p_treasurer: selections.treasurer || "abstain",
            p_secretary: selections.secretary || "abstain",
            p_speeches_acknowledged: true,
        });

        if (error) {
            console.error("Error submitting vote:", error.message);
            submitError = "Failed to submit vote. Please try again.";
        } else if (data?.ok) {
            submitSuccess = true;
        } else if (data?.reason === "duplicate") {
            submitError = "This email address has already submitted a vote.";
            hasVotedBefore = true;
        } else if (data?.reason === "closed") {
            submitError =
                "Voting is currently closed, so your vote could not be recorded.";
            fetchVotingStatus();
        } else if (data?.reason === "acknowledgment_required") {
            submitError =
                "Please confirm that you watched every candidate's speech, then submit again.";
        } else if (data?.reason === "invalid_input") {
            submitError =
                "Please double-check your name and email address, then try again.";
        } else {
            submitError = "An error occurred. Please try again.";
        }

        isSubmitting = false;
    }

    // Format role title for display
    function formatRoleTitle(roleId) {
        return roleId
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    }

    // Builds a timestamped link into the livestream replay for a candidate's
    // speech, per the watchUrl + (?|&)t=<seconds>s convention. Mirrors the
    // same helper in src/pages/elections.astro. Only called when a candidate
    // has a numeric speechTimestamp.
    function timestampedSpeechUrl(seconds) {
        const separator = electionLivestream.watchUrl.includes("?")
            ? "&"
            : "?";
        return `${electionLivestream.watchUrl}${separator}t=${seconds}s`;
    }

    // Splits a candidate's transcribed speech into paragraphs for the "Read
    // their speech" disclosure. Mirrors the same logic in elections.astro.
    function speechParagraphs(speech) {
        return speech
            .split("\n\n")
            .map((paragraph) => paragraph.trim())
            .filter(Boolean);
    }
</script>

<div class="election-ballot">
    {#if votingStatusLoading}
        <!-- Loading State -->
        <div class="loading-container">
            <div class="loading-spinner-large"></div>
            <p>Checking voting status...</p>
        </div>
    {:else if submitSuccess}
        <!-- Success State -->
        <div class="success-container">
            <div class="success-icon">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-16 w-16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            </div>
            <h3 class="success-title">¡Gracias for Voting!</h3>
            <p class="success-message">
                Your vote has been submitted and recorded. Thank you for
                helping choose the next LSP Junior Board.
            </p>
            <p class="success-note">
                A confirmation has been recorded under: <strong
                    >{voterEmail}</strong
                >
            </p>
        </div>
    {:else if !votingStatus.isOpen}
        <!-- Voting Closed State -->
        <div class="closed-container">
            <div class="closed-icon">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-16 w-16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
            </div>
            <h3 class="closed-title">Voting is Currently Closed</h3>
            <p class="closed-message">{votingStatus.message}</p>
            <div class="voting-schedule-info">
                <div class="schedule-box">
                    <span class="schedule-label">Official Voting Period</span>
                    {#if opensAt && closesAt}
                        <span class="schedule-dates"
                            >{formatDateTime(opensAt)}</span
                        >
                        <span class="schedule-times"
                            >through {formatDateTime(closesAt)}</span
                        >
                    {:else}
                        <span class="schedule-dates"
                            >Voting dates will be announced soon</span
                        >
                    {/if}
                </div>
                <p class="closed-note">
                    Please come back during the voting period to cast your vote.
                    In the meantime, watch the candidate speeches above and get
                    to know everyone on the ballot.
                </p>
                {#if votingStatusError}
                    <button
                        type="button"
                        class="retry-button"
                        on:click={retryVotingStatus}
                    >
                        Check again
                    </button>
                {/if}
            </div>
        </div>
    {:else}
        <!-- Voting Form -->
        <form on:submit={handleSubmit} class="ballot-form">
            <!-- Header -->
            <div class="form-header">
                <h3 class="form-title">Cast Your Vote</h3>
                <p class="form-subtitle">{votingStatus.message}</p>
            </div>

            <!-- Voter Information Section -->
            <div class="voter-info-section">
                <h4 class="section-title">Your Information</h4>
                <p class="section-description">
                    Please provide your information for verification purposes.
                </p>

                <div class="form-grid">
                    <div class="form-group">
                        <label for="voter-name">Full Name *</label>
                        <input
                            type="text"
                            id="voter-name"
                            bind:value={voterName}
                            placeholder="Enter your full name"
                            required
                        />
                    </div>

                    <div class="form-group">
                        <label for="voter-email">Email Address *</label>
                        <input
                            type="email"
                            id="voter-email"
                            bind:value={voterEmail}
                            on:blur={checkEmail}
                            placeholder="Enter your email"
                            required
                            class:error={hasVotedBefore}
                        />
                        {#if hasVotedBefore}
                            <p class="error-text">
                                This email has already submitted a vote.
                            </p>
                        {/if}
                    </div>

                    <div class="form-group full-width">
                        <label for="voter-affiliation"
                            >Your Role/Affiliation *</label
                        >
                        <select
                            id="voter-affiliation"
                            bind:value={voterAffiliation}
                            required
                        >
                            <option value="">Select your affiliation...</option>
                            {#each affiliations as aff}
                                <option value={aff.value}>{aff.label}</option>
                            {/each}
                        </select>
                        {#if voterAffiliation === "community-member"}
                            <div class="community-note">
                                <span class="community-note-icon">💜</span>
                                <div>
                                    <strong>Thank you for your voice!</strong>
                                    <p>
                                        As a Community Member, your vote helps
                                        us gauge community sentiment but will
                                        not be counted in the official election
                                        results. Only LSP Instructors, YTT
                                        Students, and Board Members are eligible
                                        to vote in the official election.
                                    </p>
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>

            <!-- Candidate Speeches Acknowledgment -->
            <div class="speeches-section">
                <h4 class="section-title">Candidate Speeches</h4>
                <p class="section-description">
                    Confirm that you watched each candidate speak. The full
                    speeches are in the livestream at the top of this page.
                    Your selections unlock once every box is checked.
                </p>

                <div
                    class="ack-progress"
                    class:complete={allSpeechesAcknowledged}
                    role="status"
                    aria-live="polite"
                >
                    <span class="ack-progress-count"
                        >{acknowledgedCount} of {totalSpeeches}</span
                    >
                    <span class="ack-progress-label">
                        {#if allSpeechesAcknowledged}
                            speeches acknowledged. Your ballot is unlocked.
                        {:else}
                            speeches acknowledged
                        {/if}
                    </span>
                </div>

                {#each ballotRoles as role}
                    <div class="ack-role-block">
                        <h5 class="role-title">{role.title}</h5>
                        <div class="ack-list">
                            {#each role.candidates as candidate}
                                <div
                                    class="ack-row"
                                    class:checked={speechAck[candidate.key] ===
                                        true}
                                >
                                    <label class="ack-label">
                                        <input
                                            type="checkbox"
                                            checked={speechAck[
                                                candidate.key
                                            ] === true}
                                            on:change={(event) =>
                                                toggleSpeech(
                                                    candidate.key,
                                                    event.currentTarget.checked,
                                                )}
                                        />
                                        <span class="ack-text"
                                            >I watched {candidate.name}'s
                                            speech</span
                                        >
                                    </label>
                                    {#if typeof candidate.speechTimestamp === "number" || (typeof candidate.speech === "string" && candidate.speech.trim() !== "")}
                                        <div class="ack-actions">
                                            {#if typeof candidate.speechTimestamp === "number"}
                                                <a
                                                    href={timestampedSpeechUrl(
                                                        candidate.speechTimestamp,
                                                    )}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    class="ack-action-link"
                                                >
                                                    <svg
                                                        xmlns="http://www.w3.org/2000/svg"
                                                        class="h-4 w-4"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                        aria-hidden="true"
                                                    >
                                                        <path
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                            stroke-width="2"
                                                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                        />
                                                    </svg>
                                                    Watch their speech
                                                </a>
                                            {/if}
                                            {#if typeof candidate.speech === "string" && candidate.speech.trim() !== ""}
                                                <details class="ack-speech">
                                                    <summary
                                                        >Read their speech</summary
                                                    >
                                                    <div
                                                        class="ack-speech-body"
                                                    >
                                                        {#each speechParagraphs(candidate.speech) as paragraph}
                                                            <p>{paragraph}</p>
                                                        {/each}
                                                        <p
                                                            class="ack-speech-note"
                                                        >
                                                            Transcribed from
                                                            the live broadcast
                                                            and lightly edited
                                                            for readability.
                                                        </p>
                                                    </div>
                                                </details>
                                            {/if}
                                        </div>
                                    {/if}
                                    {#if candidate.speechClip}
                                        <!-- Per-candidate edited speech clip.
                                             Set `speechClip` in
                                             src/data/elections2026.js to show
                                             it here. -->
                                        <div class="speech-clip">
                                            <iframe
                                                src={candidate.speechClip}
                                                title={`${candidate.name} speech`}
                                                loading="lazy"
                                                frameborder="0"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                                referrerpolicy="strict-origin-when-cross-origin"
                                                allowfullscreen
                                            ></iframe>
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>

            <!-- Voting Section -->
            <div class="voting-section" class:locked={!allSpeechesAcknowledged}>
                <h4 class="section-title">Your Selections</h4>
                <p class="section-description">
                    Select one candidate for each role, or choose to abstain.
                    All selections default to abstain if nothing is chosen.
                </p>

                {#if !allSpeechesAcknowledged}
                    <div class="lock-note">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            aria-hidden="true"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                        </svg>
                        <span>
                            Locked until you confirm every speech.
                            <strong
                                >{acknowledgedCount} of {totalSpeeches} speeches
                                acknowledged.</strong
                            >
                        </span>
                    </div>
                {/if}

                <div class="voting-fields" aria-hidden={!allSpeechesAcknowledged}>
                    {#each ballotRoles as role}
                        <div class="role-voting-block">
                            <h5 class="role-title">{role.title}</h5>
                            <div class="candidates-grid">
                                {#each role.candidates as candidate}
                                    <label
                                        class="candidate-option"
                                        class:selected={selections[role.id] ===
                                            candidate.name}
                                    >
                                        <input
                                            type="radio"
                                            name={role.id}
                                            value={candidate.name}
                                            disabled={!allSpeechesAcknowledged}
                                            bind:group={selections[role.id]}
                                        />
                                        <span class="candidate-name"
                                            >{candidate.name}</span
                                        >
                                    </label>
                                {/each}
                                <label
                                    class="candidate-option abstain-option"
                                    class:selected={selections[role.id] ===
                                        "abstain"}
                                >
                                    <input
                                        type="radio"
                                        name={role.id}
                                        value="abstain"
                                        disabled={!allSpeechesAcknowledged}
                                        bind:group={selections[role.id]}
                                    />
                                    <span class="candidate-name">Abstain</span>
                                </label>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>

            <!-- Error Message -->
            {#if submitError}
                <div class="error-banner">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <span>{submitError}</span>
                </div>
            {/if}

            <!-- Submit Button -->
            <div class="submit-section">
                <button
                    type="submit"
                    class="submit-button"
                    disabled={!isFormValid || isSubmitting}
                >
                    {#if isSubmitting}
                        <span class="loading-spinner"></span>
                        Submitting...
                    {:else}
                        Submit My Vote
                    {/if}
                </button>
                {#if !allSpeechesAcknowledged}
                    <p class="submit-blocked">
                        Confirm all {totalSpeeches} speeches above to submit.
                    </p>
                {/if}
                <p class="submit-note">
                    {#if voterAffiliation === "community-member"}
                        By submitting, you acknowledge that your community vote
                        is advisory only and will not count toward the official
                        election results.
                    {:else}
                        By submitting, you confirm that you are an eligible
                        voter (LSP Instructor, YTT Student, or Board Member) and
                        that your selections are final.
                    {/if}
                </p>
            </div>
        </form>
    {/if}
</div>

<style>
    .election-ballot {
        max-width: 800px;
        margin: 0 auto;
    }

    /* Success State */
    .success-container {
        text-align: center;
        padding: 3rem 2rem;
        background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
        border-radius: 1rem;
        border: 2px solid #10b981;
    }

    .success-icon {
        color: #10b981;
        margin-bottom: 1.5rem;
        display: flex;
        justify-content: center;
    }

    .success-title {
        font-size: 1.75rem;
        font-weight: 800;
        color: #065f46;
        margin-bottom: 1rem;
    }

    .success-message {
        font-size: 1.125rem;
        color: #047857;
        margin-bottom: 1rem;
    }

    .success-note {
        font-size: 0.875rem;
        color: #059669;
    }

    /* Loading State */
    .loading-container {
        text-align: center;
        padding: 3rem 2rem;
        background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
        border-radius: 1rem;
        border: 2px solid #d1d5db;
    }

    .loading-spinner-large {
        width: 3rem;
        height: 3rem;
        border: 4px solid #e5e7eb;
        border-top-color: #b5a18d;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 1rem;
    }

    .loading-container p {
        color: #6b7280;
        font-size: 1rem;
    }

    /* Closed State */
    .closed-container {
        text-align: center;
        padding: 3rem 2rem;
        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        border-radius: 1rem;
        border: 2px solid #f59e0b;
    }

    .closed-icon {
        color: #f59e0b;
        margin-bottom: 1.5rem;
        display: flex;
        justify-content: center;
    }

    .closed-title {
        font-size: 1.75rem;
        font-weight: 800;
        color: #92400e;
        margin-bottom: 1rem;
    }

    .closed-message {
        font-size: 1.125rem;
        color: #b45309;
        margin-bottom: 1.5rem;
    }

    .voting-schedule-info {
        margin-top: 1.5rem;
    }

    .schedule-box {
        background: rgba(255, 255, 255, 0.6);
        border-radius: 0.75rem;
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        margin-bottom: 1rem;
    }

    .schedule-label {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #92400e;
    }

    .schedule-dates {
        font-size: 1.25rem;
        font-weight: 800;
        color: #78350f;
    }

    .schedule-times {
        font-size: 0.875rem;
        color: #b45309;
    }

    .closed-note {
        font-size: 0.875rem;
        color: #92400e;
        max-width: 400px;
        margin: 0 auto;
        line-height: 1.5;
    }

    .retry-button {
        margin-top: 1.25rem;
        padding: 0.5rem 1.5rem;
        background: rgba(255, 255, 255, 0.8);
        border: 1px solid #f59e0b;
        border-radius: 9999px;
        color: #92400e;
        font-size: 0.875rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    }

    .retry-button:hover {
        background: #ffffff;
    }

    /* Form Styles */
    .ballot-form {
        background: white;
        border-radius: 1rem;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
        overflow: hidden;
    }

    .form-header {
        background: linear-gradient(135deg, #b5a18d 0%, #a08875 100%);
        padding: 2rem;
        text-align: center;
        color: white;
    }

    .form-title {
        font-size: 1.75rem;
        font-weight: 800;
        margin-bottom: 0.5rem;
    }

    .form-subtitle {
        font-size: 1rem;
        opacity: 0.9;
    }

    /* Sections */
    .voter-info-section,
    .speeches-section,
    .voting-section {
        padding: 2rem;
        border-bottom: 1px solid #e5e7eb;
    }

    .section-title {
        font-size: 1.25rem;
        font-weight: 700;
        color: #1e1e1e;
        margin-bottom: 0.5rem;
    }

    .section-description {
        font-size: 0.875rem;
        color: #6b7280;
        margin-bottom: 1.5rem;
    }

    /* Form Grid */
    .form-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1.5rem;
    }

    @media (max-width: 640px) {
        .form-grid {
            grid-template-columns: 1fr;
        }
    }

    .form-group {
        display: flex;
        flex-direction: column;
    }

    .form-group.full-width {
        grid-column: 1 / -1;
    }

    .form-group label {
        font-size: 0.875rem;
        font-weight: 600;
        color: #374151;
        margin-bottom: 0.5rem;
    }

    .form-group input,
    .form-group select {
        padding: 0.75rem 1rem;
        border: 2px solid #e5e7eb;
        border-radius: 0.5rem;
        font-size: 1rem;
        transition:
            border-color 0.2s,
            box-shadow 0.2s;
    }

    .form-group input:focus,
    .form-group select:focus {
        outline: none;
        border-color: #b5a18d;
        box-shadow: 0 0 0 3px rgba(181, 161, 141, 0.2);
    }

    .form-group input.error {
        border-color: #ef4444;
    }

    .error-text {
        font-size: 0.75rem;
        color: #ef4444;
        margin-top: 0.25rem;
    }

    /* Community Member Note */
    .community-note {
        display: flex;
        gap: 0.75rem;
        margin-top: 1rem;
        padding: 1rem;
        background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
        border: 1px solid #c4b5fd;
        border-radius: 0.75rem;
    }

    .community-note-icon {
        font-size: 1.5rem;
        flex-shrink: 0;
    }

    .community-note strong {
        display: block;
        color: #6d28d9;
        margin-bottom: 0.25rem;
    }

    .community-note p {
        font-size: 0.875rem;
        color: #5b21b6;
        margin: 0;
        line-height: 1.5;
    }

    /* Speech Acknowledgments */
    .ack-progress {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        flex-wrap: wrap;
        padding: 0.875rem 1.25rem;
        margin-bottom: 1.5rem;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 0.75rem;
        transition:
            background 0.2s,
            border-color 0.2s;
    }

    .ack-progress.complete {
        background: #ecfdf5;
        border-color: #6ee7b7;
    }

    .ack-progress-count {
        font-size: 1.125rem;
        font-weight: 800;
        color: #b5a18d;
    }

    .ack-progress.complete .ack-progress-count {
        color: #047857;
    }

    .ack-progress-label {
        font-size: 0.875rem;
        color: #6b7280;
    }

    .ack-progress.complete .ack-progress-label {
        color: #047857;
    }

    .ack-role-block {
        margin-bottom: 1.5rem;
        padding: 1.25rem 1.5rem;
        background: #f9fafb;
        border-radius: 0.75rem;
    }

    .ack-role-block:last-child {
        margin-bottom: 0;
    }

    .ack-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .ack-row {
        background: white;
        border: 2px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 0.875rem 1rem;
        transition: all 0.2s;
    }

    .ack-row.checked {
        border-color: #b5a18d;
        background: linear-gradient(135deg, #faf8f6 0%, #f5f0eb 100%);
    }

    .ack-label {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
        /* iOS touch fixes */
        -webkit-tap-highlight-color: transparent;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        touch-action: manipulation;
    }

    .ack-label input[type="checkbox"] {
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        width: 1.5rem;
        height: 1.5rem;
        min-width: 1.5rem;
        border: 2px solid #d1d5db;
        border-radius: 0.375rem;
        background: white;
        cursor: pointer;
        position: relative;
        margin: 0;
        flex-shrink: 0;
    }

    .ack-label input[type="checkbox"]:checked {
        border-color: #b5a18d;
        background: #b5a18d;
    }

    .ack-label input[type="checkbox"]:checked::after {
        content: "";
        position: absolute;
        top: 45%;
        left: 50%;
        width: 0.35rem;
        height: 0.7rem;
        border: solid white;
        border-width: 0 2.5px 2.5px 0;
        transform: translate(-50%, -50%) rotate(45deg);
    }

    .ack-text {
        font-size: 0.9375rem;
        font-weight: 500;
        color: #1e1e1e;
    }

    /* Speech actions: watch link + read-speech disclosure. Sits below the
       ack-label, never inside it, so clicking these never toggles the
       checkbox. */
    .ack-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: 0.5rem 1.25rem;
        margin-top: 0.625rem;
        padding-left: 2.25rem;
    }

    .ack-action-link {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #6b7280;
        text-decoration: none;
        transition: color 0.2s;
    }

    .ack-action-link svg {
        flex-shrink: 0;
    }

    .ack-action-link:hover {
        color: #b5a18d;
    }

    .ack-speech {
        font-size: 0.8125rem;
    }

    .ack-speech summary {
        display: inline-flex;
        align-items: center;
        cursor: pointer;
        font-weight: 600;
        color: #6b7280;
        list-style: none;
        -webkit-tap-highlight-color: transparent;
        transition: color 0.2s;
    }

    .ack-speech summary::-webkit-details-marker {
        display: none;
    }

    .ack-speech summary::before {
        content: "▸";
        display: inline-block;
        margin-right: 0.375rem;
        color: #b5a18d;
        transition: transform 0.2s;
    }

    .ack-speech[open] summary::before {
        transform: rotate(90deg);
    }

    .ack-speech summary:hover {
        color: #b5a18d;
    }

    .ack-speech-body {
        margin-top: 0.625rem;
        max-height: 15rem;
        overflow-y: auto;
        padding: 0.75rem 0.875rem;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        text-align: left;
    }

    .ack-speech-body p {
        font-size: 0.8125rem;
        line-height: 1.55;
        color: #374151;
        margin: 0 0 0.75rem;
    }

    .ack-speech-body p:last-child {
        margin-bottom: 0;
    }

    .ack-speech-body p.ack-speech-note {
        margin-top: 0.25rem;
        font-style: italic;
        color: #9ca3af;
        font-size: 0.75rem;
    }

    @media (max-width: 480px) {
        .ack-actions {
            padding-left: 0;
        }
    }

    .speech-clip {
        position: relative;
        margin-top: 0.875rem;
        aspect-ratio: 16 / 9;
        border-radius: 0.5rem;
        overflow: hidden;
        background: #000;
    }

    .speech-clip iframe {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: 0;
    }

    /* Locked Selections */
    .voting-section.locked .voting-fields {
        opacity: 0.4;
        filter: grayscale(0.5);
        pointer-events: none;
        user-select: none;
    }

    .lock-note {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 1rem 1.25rem;
        margin-bottom: 1.5rem;
        background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
        border: 1px solid #fcd34d;
        border-radius: 0.75rem;
        font-size: 0.875rem;
        color: #92400e;
        line-height: 1.5;
    }

    .lock-note svg {
        flex-shrink: 0;
        color: #d97706;
    }

    .lock-note strong {
        display: block;
        margin-top: 0.125rem;
    }

    /* Role Voting Block */
    .role-voting-block {
        margin-bottom: 2rem;
        padding: 1.5rem;
        background: #f9fafb;
        border-radius: 0.75rem;
    }

    .role-voting-block:last-child {
        margin-bottom: 0;
    }

    .role-title {
        font-size: 1.125rem;
        font-weight: 700;
        color: #b5a18d;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 1rem;
        padding-bottom: 0.5rem;
        border-bottom: 2px solid #ffbd59;
    }

    .candidates-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0.75rem;
    }

    .candidate-option {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem;
        background: white;
        border: 2px solid #e5e7eb;
        border-radius: 0.5rem;
        cursor: pointer;
        transition: all 0.2s;
        /* iOS touch fixes */
        -webkit-tap-highlight-color: transparent;
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        touch-action: manipulation;
        position: relative;
    }

    .candidate-option:hover {
        border-color: #b5a18d;
        background: #faf8f6;
    }

    /* Active state for mobile touch feedback */
    .candidate-option:active {
        transform: scale(0.98);
        background: #f5f0eb;
    }

    .candidate-option.selected {
        border-color: #b5a18d;
        background: linear-gradient(135deg, #faf8f6 0%, #f5f0eb 100%);
        box-shadow: 0 2px 8px rgba(181, 161, 141, 0.2);
    }

    .candidate-option input[type="radio"] {
        /* Make radio button visible and tappable on iOS */
        -webkit-appearance: none;
        -moz-appearance: none;
        appearance: none;
        width: 1.5rem;
        height: 1.5rem;
        min-width: 1.5rem;
        border: 2px solid #d1d5db;
        border-radius: 50%;
        background: white;
        cursor: pointer;
        position: relative;
        margin: 0;
        flex-shrink: 0;
    }

    .candidate-option input[type="radio"]:checked {
        border-color: #b5a18d;
        background: #b5a18d;
    }

    .candidate-option input[type="radio"]:checked::after {
        content: "";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 0.5rem;
        height: 0.5rem;
        background: white;
        border-radius: 50%;
    }

    .candidate-name {
        font-weight: 500;
        color: #1e1e1e;
    }

    .abstain-option {
        background: #f3f4f6;
        border-style: dashed;
    }

    .abstain-option .candidate-name {
        color: #6b7280;
        font-style: italic;
    }

    /* Error Banner */
    .error-banner {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1.5rem;
        margin: 0 2rem;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 0.5rem;
        color: #dc2626;
        font-size: 0.875rem;
    }

    /* Submit Section */
    .submit-section {
        padding: 2rem;
        text-align: center;
        background: #f9fafb;
    }

    .submit-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        padding: 1rem 3rem;
        background: linear-gradient(135deg, #b5a18d 0%, #a08875 100%);
        color: white;
        font-size: 1.125rem;
        font-weight: 700;
        border: none;
        border-radius: 9999px;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 200px;
    }

    .submit-button:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(181, 161, 141, 0.4);
    }

    .submit-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .loading-spinner {
        width: 1.25rem;
        height: 1.25rem;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .submit-blocked {
        font-size: 0.8125rem;
        font-weight: 600;
        color: #b45309;
        margin-top: 0.75rem;
    }

    .submit-note {
        font-size: 0.75rem;
        color: #6b7280;
        margin-top: 1rem;
        max-width: 400px;
        margin-left: auto;
        margin-right: auto;
    }
</style>
