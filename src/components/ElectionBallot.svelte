<script>
    import { onMount } from "svelte";
    import {
        submitVote,
        isVotingOpen,
        hasAlreadyVoted,
    } from "../lib/electionFirebase.js";

    // Props - candidate data passed from parent
    export let roles = [];

    // Voting period status
    let votingStatus = { isOpen: false, message: "Checking voting status..." };

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
    ];

    onMount(async () => {
        votingStatus = await isVotingOpen();
    });

    // Check if email has voted when email changes
    async function checkEmail() {
        if (voterEmail && voterEmail.includes("@")) {
            hasVotedBefore = await hasAlreadyVoted(voterEmail);
        }
    }

    // Form validation
    $: isFormValid =
        voterName.trim() !== "" &&
        voterEmail.trim() !== "" &&
        voterEmail.includes("@") &&
        voterAffiliation !== "" &&
        !hasVotedBefore;

    // Handle form submission
    async function handleSubmit(event) {
        event.preventDefault();

        if (!isFormValid || isSubmitting) return;

        isSubmitting = true;
        submitError = "";

        const voteData = {
            name: voterName.trim(),
            email: voterEmail.trim(),
            affiliation: voterAffiliation,
            secretary: selections.secretary || "abstain",
            treasurer: selections.treasurer || "abstain",
            vicePresident: selections["vice-president"] || "abstain",
            president: selections.president || "abstain",
        };

        const result = await submitVote(voteData);

        if (result.success) {
            submitSuccess = true;
        } else {
            submitError =
                result.error || "An error occurred. Please try again.";
        }

        isSubmitting = false;
    }

    // Get candidate list for a role
    function getCandidatesForRole(roleId) {
        const role = roles.find((r) => r.id === roleId);
        return role ? role.candidates : [];
    }

    // Format role title for display
    function formatRoleTitle(roleId) {
        return roleId
            .split("-")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    }
</script>

<div class="election-ballot">
    {#if submitSuccess}
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
            <h3 class="success-title">Thank You for Voting!</h3>
            <p class="success-message">
                Your vote has been successfully submitted and recorded. Thank
                you for participating in the LSP Junior Board election!
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
                    <span class="schedule-dates"
                        >December 9 – December 10, 2025</span
                    >
                    <span class="schedule-times">12:00 AM – 11:59 PM (CST)</span
                    >
                </div>
                <p class="closed-note">
                    Please come back during the voting period to cast your vote.
                    Make sure to review all candidates above before the voting
                    window opens!
                </p>
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
                    </div>
                </div>
            </div>

            <!-- Voting Section -->
            <div class="voting-section">
                <h4 class="section-title">Your Selections</h4>
                <p class="section-description">
                    Select one candidate for each role, or choose to abstain.
                    All selections default to abstain if nothing is chosen.
                </p>

                {#each ["secretary", "treasurer", "vice-president", "president"] as roleId}
                    <div class="role-voting-block">
                        <h5 class="role-title">{formatRoleTitle(roleId)}</h5>
                        <div class="candidates-grid">
                            {#each getCandidatesForRole(roleId) as candidate}
                                <label
                                    class="candidate-option"
                                    class:selected={selections[roleId] ===
                                        candidate.name}
                                >
                                    <input
                                        type="radio"
                                        name={roleId}
                                        value={candidate.name}
                                        bind:group={selections[roleId]}
                                    />
                                    <span class="candidate-name"
                                        >{candidate.name}</span
                                    >
                                </label>
                            {/each}
                            <label
                                class="candidate-option abstain-option"
                                class:selected={selections[roleId] ===
                                    "abstain"}
                            >
                                <input
                                    type="radio"
                                    name={roleId}
                                    value="abstain"
                                    bind:group={selections[roleId]}
                                />
                                <span class="candidate-name">Abstain</span>
                            </label>
                        </div>
                    </div>
                {/each}
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
                <p class="submit-note">
                    By submitting, you confirm that you are an eligible voter
                    (LSP Instructor, YTT Student, or Board Member) and that your
                    selections are final.
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

    .submit-note {
        font-size: 0.75rem;
        color: #6b7280;
        margin-top: 1rem;
        max-width: 400px;
        margin-left: auto;
        margin-right: auto;
    }
</style>
