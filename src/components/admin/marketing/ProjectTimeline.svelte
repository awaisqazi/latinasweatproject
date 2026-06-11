<script>
  import { onMount } from "svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import {
    ArrowRight,
    CircleAlert,
    MessageSquareText,
    RefreshCw,
    Send,
    Trash2,
  } from "@lucide/svelte";

  export let supabase;
  export let project = null;
  export let refreshKey = 0;
  // Comments table to read/write; board projects pass "board_project_comments".
  export let table = "project_comments";

  let comments = [];
  let draftComment = "";
  let isLoading = false;
  let isSubmitting = false;
  let deletingCommentId = "";
  let errorMessage = "";
  let loadedProjectId = "";
  let lastRefreshKey = refreshKey;
  let currentUserId = "";
  let hasMounted = false;

  $: if (hasMounted && project?.id && project.id !== loadedProjectId) {
    loadedProjectId = project.id;
    draftComment = "";
    loadComments();
  }
  $: if (hasMounted && project?.id && refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadComments();
  }

  onMount(() => {
    hasMounted = true;
    loadCurrentUser();

    if (project?.id) {
      loadedProjectId = project.id;
      loadComments();
    }
  });

  async function loadCurrentUser() {
    if (!supabase) return;

    const { data } = await supabase.auth.getUser();
    currentUserId = data.user?.id || "";
  }

  async function loadComments() {
    if (!supabase || !project?.id) return;

    isLoading = true;
    errorMessage = "";

    try {
      const { data, error } = await withTimeout(
        supabase
          .from(table)
          .select("id, project_id, author_id, author_name, author_email, body, created_at")
          .eq("project_id", project.id)
          .order("created_at", { ascending: true }),
      );

      if (error) {
        comments = [];
        errorMessage = error.message;
      } else {
        comments = data || [];
      }
    } catch (error) {
      comments = [];
      errorMessage =
        error?.message || "Timeline comments took too long to load.";
    } finally {
      isLoading = false;
    }
  }

  async function submitComment(event) {
    event?.preventDefault();

    const body = draftComment.trim();

    if (!body || !supabase || !project?.id || isSubmitting) return;

    isSubmitting = true;
    errorMessage = "";

    try {
      const { data, error } = await withTimeout(
        supabase
          .from(table)
          .insert({
            project_id: project.id,
            body,
          })
          .select("id, project_id, author_id, author_name, author_email, body, created_at")
          .single(),
      );

      if (error) {
        errorMessage = error.message;
        return;
      }

      comments = [...comments, data];
      draftComment = "";
    } catch (error) {
      errorMessage =
        error?.message || "Could not add this timeline comment.";
    } finally {
      isSubmitting = false;
    }
  }

  let commentPendingDelete = null;

  function requestDeleteComment(comment) {
    if (!comment?.id || deletingCommentId) return;
    commentPendingDelete = comment;
  }

  async function deleteComment(comment) {
    if (!comment?.id || deletingCommentId) return;

    commentPendingDelete = null;
    deletingCommentId = comment.id;
    errorMessage = "";

    try {
      const { error } = await withTimeout(
        supabase
          .from(table)
          .delete()
          .eq("id", comment.id),
      );

      if (error) {
        errorMessage = error.message;
        return;
      }

      comments = comments.filter((item) => item.id !== comment.id);
    } catch (error) {
      errorMessage =
        error?.message || "Could not delete this timeline comment.";
    } finally {
      deletingCommentId = "";
    }
  }

  function canDeleteComment(comment) {
    return Boolean(currentUserId && comment.author_id === currentUserId);
  }

  function withTimeout(request, timeoutMs = 15000) {
    return Promise.race([
      request,
      new Promise((_, reject) => {
        window.setTimeout(
          () => reject(new Error("Timeline request took too long.")),
          timeoutMs,
        );
      }),
    ]);
  }

  function formatDateTime(value) {
    if (!value) return "";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function getInitials(name, email) {
    const source = name || email || "Team member";
    const words = source
      .replace(/@.*/, "")
      .split(/[\s._-]+/)
      .map((word) => word.trim())
      .filter(Boolean);

    return (words[0]?.[0] || "T").toUpperCase() + (words[1]?.[0] || "").toUpperCase();
  }

  function getStatusMoveParts(comment) {
    const match = String(comment?.body || "").match(
      /^Moved this project from (.+) to (.+)\.$/,
    );

    if (!match) return null;

    return {
      from: match[1],
      to: match[2],
    };
  }
</script>

<section aria-labelledby="project-timeline-title">
  <div class="mb-3 flex items-center justify-between gap-3">
    <div class="flex items-center gap-2">
      <MessageSquareText class="h-4 w-4 text-[#0f766e]" aria-hidden="true" />
      <h4 id="project-timeline-title" class="font-bold">Timeline</h4>
    </div>

    <button
      type="button"
      class="inline-flex min-h-9 items-center gap-2 rounded-md border border-black/10 px-3 text-xs font-bold text-gray-700 transition hover:border-[#0f766e]/30 hover:text-[#0f766e] disabled:cursor-not-allowed disabled:opacity-60"
      onclick={loadComments}
      disabled={isLoading || !project?.id}
    >
      <RefreshCw class="h-3.5 w-3.5 {isLoading ? 'animate-spin' : ''}" aria-hidden="true" />
      Refresh
    </button>
  </div>

  {#if errorMessage}
    <div
      class="mb-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
      role="alert"
    >
      <CircleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{errorMessage}</span>
    </div>
  {/if}

  <form class="rounded-md border border-black/10 bg-gray-50 p-3" onsubmit={submitComment}>
    <label class="block text-sm font-bold" for={`timeline-comment-${project?.id || "project"}`}>
      Add a comment
    </label>
    <textarea
      id={`timeline-comment-${project?.id || "project"}`}
      class="mt-2 min-h-24 w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 text-sm leading-6 outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
      bind:value={draftComment}
      placeholder="Share an update, question, blocker, or handoff note."
      disabled={isSubmitting}
    ></textarea>
    <div class="mt-2 flex justify-end">
      <button
        type="submit"
        class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!draftComment.trim() || isSubmitting}
      >
        {#if isSubmitting}
          <span class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin" aria-hidden="true"></span>
          Posting
        {:else}
          <Send class="h-4 w-4" aria-hidden="true" />
          Post comment
        {/if}
      </button>
    </div>
  </form>

  <div class="mt-4 space-y-3">
    {#if project?.edit_notes}
      <article class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
        <p class="text-xs font-bold uppercase tracking-[0.12em] text-amber-700">
          Original project note
        </p>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-950">
          {project.edit_notes}
        </p>
      </article>
    {/if}

    {#if isLoading}
      <div class="flex items-center gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
        <span class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin" aria-hidden="true"></span>
        Loading timeline
      </div>
    {:else if comments.length}
      {#each comments as comment}
        {@const statusMove = getStatusMoveParts(comment)}
        <article class="flex gap-3 rounded-md border px-4 py-3 {statusMove ? 'border-teal-200 bg-teal-50' : 'border-gray-200 bg-white'}">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full {statusMove ? 'bg-[#0f766e] text-white' : 'bg-[#1E1E1E] text-[#ffbd59]'} text-xs font-bold">
            {#if statusMove}
              <ArrowRight class="h-4 w-4" aria-hidden="true" />
            {:else}
              {getInitials(comment.author_name, comment.author_email)}
            {/if}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <p class="font-bold">{comment.author_name}</p>
              {#if statusMove}
                <span class="rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-[#0f766e]">
                  Column change
                </span>
              {/if}
              <time class="text-xs font-semibold text-gray-500" datetime={comment.created_at}>
                {formatDateTime(comment.created_at)}
              </time>
            </div>
            {#if statusMove}
              <p class="mt-2 flex flex-wrap items-center gap-2 text-sm leading-6 text-teal-950">
                <span class="rounded-md border border-teal-200 bg-white px-2 py-1 font-bold">
                  {statusMove.from}
                </span>
                <ArrowRight class="h-4 w-4 text-[#0f766e]" aria-hidden="true" />
                <span class="rounded-md border border-teal-200 bg-white px-2 py-1 font-bold">
                  {statusMove.to}
                </span>
              </p>
            {:else}
              <p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-700">{comment.body}</p>
            {/if}
            {#if canDeleteComment(comment)}
              <button
                type="button"
                class="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md border border-red-200 px-2.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`Delete timeline comment from ${formatDateTime(comment.created_at)}`}
                onclick={() => requestDeleteComment(comment)}
                disabled={deletingCommentId === comment.id}
              >
                {#if deletingCommentId === comment.id}
                  <span class="h-3.5 w-3.5 rounded-full border-2 border-red-700 border-t-transparent animate-spin" aria-hidden="true"></span>
                  Deleting
                {:else}
                  <Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                {/if}
              </button>
            {/if}
          </div>
        </article>
      {/each}
    {:else}
      <p class="rounded-md border border-dashed border-gray-300 bg-white px-4 py-5 text-center text-sm text-gray-500">
        No timeline comments yet. Add the first update to start the thread.
      </p>
    {/if}
  </div>
</section>

<ConfirmDialog
  open={!!commentPendingDelete}
  title="Delete timeline comment"
  message="This removes the comment for everyone on the project. This cannot be undone."
  confirmLabel="Delete comment"
  tone="danger"
  busy={!!deletingCommentId}
  onConfirm={() => deleteComment(commentPendingDelete)}
  onCancel={() => (commentPendingDelete = null)}
/>
