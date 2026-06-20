<script>
  import { Send } from "@lucide/svelte";
  import SlideOver from "./SlideOver.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import Field from "../ui/Field.svelte";
  import { createTask } from "../../../lib/dashboard/workspaceTasks";

  export let supabase;
  export let open = false;
  export let currentProfileId = "";
  export let currentUserName = "";
  export let recipientId = "";
  export let recipientName = "";
  export let onClose = () => {};
  export let onSent = () => {};

  const CATEGORIES = ["Idea", "Bug", "Question", "Other"];
  let category = "Idea";
  let message = "";
  let saving = false;
  let errorMessage = "";

  function resetForm() {
    category = "Idea";
    message = "";
    saving = false;
    errorMessage = "";
  }

  function requestClose() {
    if (saving) return;
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!message.trim()) {
      errorMessage = "Add a quick note so we know what you mean.";
      return;
    }
    if (!recipientId) {
      errorMessage =
        "No feedback recipient is set yet. A superuser can choose one in User Access.";
      return;
    }

    saving = true;
    errorMessage = "";

    const fromLabel = currentUserName || "a teammate";
    // Feedback is delivered as a task in the recipient's Workspace.
    const { error } = await createTask(supabase, {
      assigneeId: recipientId,
      assignedBy: currentProfileId,
      title: `Feedback (${category})`,
      note: `${message.trim()}\n\n— from ${fromLabel}`,
      priority: "P2",
      sourceModule: "feedback",
      sourceLabel: `Feedback from ${fromLabel}`,
    });

    saving = false;

    if (error) {
      errorMessage = error.message || "Your feedback couldn't be sent right now.";
      return;
    }

    onSent();
    resetForm();
    onClose();
  }
</script>

<SlideOver
  {open}
  title="Send feedback"
  eyebrow="Dashboard"
  closeLabel="Close feedback"
  closeDisabled={saving}
  onClose={requestClose}
  onClosed={resetForm}
>
  <form class="space-y-4 px-5 py-5" onsubmit={handleSubmit}>
    <p class="text-sm leading-6 text-ink/60">
      Tell us what's working, what's broken, or what you'd love to see.
    </p>

    {#if errorMessage}
      <Banner tone="error" message={errorMessage} />
    {/if}

    <Field label="Type" id="feedback-category">
      <select id="feedback-category" class="select" bind:value={category}>
        {#each CATEGORIES as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </Field>

    <Field label="Your feedback" id="feedback-message" required>
      <textarea
        id="feedback-message"
        class="input min-h-32"
        rows="5"
        placeholder="What's on your mind?"
        bind:value={message}
      ></textarea>
    </Field>

    <Button type="submit" variant="primary" class="w-full" icon={Send} loading={saving}>
      {saving ? "Sending" : "Send feedback"}
    </Button>
  </form>
</SlideOver>
