<script>
  import { Send } from "@lucide/svelte";
  import SlideOver from "./SlideOver.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import Field from "../ui/Field.svelte";
  import { TASK_PRIORITIES, createTask } from "../../../lib/dashboard/workspaceTasks";

  export let supabase;
  export let open = false;
  export let teamMembers = [];
  export let currentProfileId = "";
  export let prefill = null;
  export let onClose = () => {};
  export let onCreated = () => {};

  let assigneeId = "";
  let title = "";
  let note = "";
  let dueDate = "";
  let priority = "P2";
  let saving = false;
  let errorMessage = "";
  let lastOpen = false;

  // Seed defaults the first time the panel opens: assign to me by default (the
  // common case, and it avoids a silent "no assignee picked" submit), and pull
  // the title from any per-record prefill.
  $: if (open && !lastOpen) {
    lastOpen = true;
    if (!assigneeId && currentProfileId) assigneeId = currentProfileId;
    if (prefill?.title && !title) title = prefill.title;
  } else if (!open && lastOpen) {
    lastOpen = false;
  }

  // Assignable teammates (anyone with an email), self last so it is easy to
  // self-assign a reminder but not the default.
  $: assignableMembers = (teamMembers || []).filter((member) => member.email);

  function resetForm() {
    assigneeId = "";
    title = "";
    note = "";
    dueDate = "";
    priority = "P2";
    saving = false;
    errorMessage = "";
  }

  function requestClose() {
    if (saving) return;
    onClose();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!assigneeId) {
      errorMessage = "Choose who this task is for.";
      return;
    }
    if (!title.trim()) {
      errorMessage = "Add a short title for the task.";
      return;
    }

    saving = true;
    errorMessage = "";

    const { data, error } = await createTask(supabase, {
      assigneeId,
      assignedBy: currentProfileId,
      title,
      note,
      dueDate,
      priority,
      sourceModule: prefill?.sourceModule || "manual",
      sourceLabel: prefill?.sourceLabel || null,
      sourceLink: prefill?.sourceLink || null,
      sourceRef: prefill?.sourceRef || null,
    });

    saving = false;

    if (error) {
      errorMessage = error.message || "The task could not be assigned right now.";
      return;
    }

    onCreated(data);
    resetForm();
    onClose();
  }
</script>

<SlideOver
  {open}
  title="Assign a task"
  eyebrow="Workspace"
  closeLabel="Close assign task"
  closeDisabled={saving}
  onClose={requestClose}
  onClosed={resetForm}
>
  <form class="space-y-4 px-5 py-5" onsubmit={handleSubmit}>
    <p class="text-sm leading-6 text-ink/60">
      The person you assign will see this in their Workspace right away.
    </p>

    {#if errorMessage}
      <Banner tone="error" message={errorMessage} />
    {/if}

    <Field label="Assign to" id="assign-task-assignee" required>
      <select id="assign-task-assignee" class="select" bind:value={assigneeId}>
        <option value="" disabled>Select a teammate</option>
        {#each assignableMembers as member}
          <option value={member.id}>
            {member.full_name || member.email}{member.id === currentProfileId ? " (me)" : ""}
          </option>
        {/each}
      </select>
    </Field>

    <Field label="Task" id="assign-task-title" required>
      <input
        id="assign-task-title"
        type="text"
        class="input"
        placeholder="What needs doing?"
        bind:value={title}
      />
    </Field>

    <Field label="Details" id="assign-task-note">
      <textarea
        id="assign-task-note"
        class="input min-h-24"
        rows="3"
        placeholder="Optional context, links, or instructions"
        bind:value={note}
      ></textarea>
    </Field>

    <div class="grid grid-cols-2 gap-3">
      <Field label="Due date" id="assign-task-due">
        <input id="assign-task-due" type="date" class="input" bind:value={dueDate} />
      </Field>
      <Field label="Priority" id="assign-task-priority">
        <select id="assign-task-priority" class="select" bind:value={priority}>
          {#each TASK_PRIORITIES as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </Field>
    </div>

    <Button type="submit" variant="primary" class="w-full" icon={Send} loading={saving}>
      {saving ? "Assigning" : "Assign task"}
    </Button>
  </form>
</SlideOver>
