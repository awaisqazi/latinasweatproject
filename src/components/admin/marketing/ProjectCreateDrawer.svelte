<script>
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import Field from "../ui/Field.svelte";
  import SlideOver from "./SlideOver.svelte";

  // Member-accessible "New project" drawer. Any marketing-module user can
  // create a project here; it inserts with member-safe defaults
  // (copy_approved stays false, source=manual, intake_reviewed=true) and the
  // brief-doc automation generates the Project Brief Doc on insert.
  export let open = false;
  export let supabase;
  export let teamMembers = [];
  export let currentUserEmail = "";
  export let statusOptions = [
    "Ready for Production",
    "In Production",
    "Ready for Copy",
    "Ready for Review",
    "Stuck",
  ];
  export let onClose = () => {};
  export let onCreated = () => {};

  const selectColumns =
    "id,title,priority,status,deadline,publish_date,details_url,brief_doc_status,copy_approved,files_url,deliverables_url,assigned_to,edit_notes,channel_tags,source,intake_reviewed";

  let saving = false;
  let errorMessage = "";
  let form = emptyForm();

  function emptyForm() {
    return {
      title: "",
      priority: "",
      status: "Ready for Production",
      deadline: "",
      publish_date: "",
      details_url: "",
      files_url: "",
      deliverables_url: "",
      channels: "",
      edit_notes: "",
      assigned_to: [],
    };
  }

  // Reset whenever the drawer is (re)opened.
  $: if (open && !saving) {
    // no-op guard so reactive statement stays cheap; reset handled on open edge
  }

  function handleOpen() {
    form = emptyForm();
    errorMessage = "";
  }

  let wasOpen = false;
  $: if (open && !wasOpen) {
    handleOpen();
  }
  $: wasOpen = open;

  function toggleAssignee(email) {
    form.assigned_to = form.assigned_to.includes(email)
      ? form.assigned_to.filter((e) => e !== email)
      : [...form.assigned_to, email];
  }

  function parseChannels(value) {
    const seen = new Set();
    return String(value || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => {
        if (!tag || seen.has(tag.toLowerCase())) return false;
        seen.add(tag.toLowerCase());
        return true;
      });
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;

    if (!form.title.trim()) {
      errorMessage = "A project needs a title.";
      return;
    }

    saving = true;
    errorMessage = "";

    const payload = {
      title: form.title.trim(),
      priority: form.priority || null,
      status: form.status || "Ready for Production",
      deadline: form.deadline || null,
      publish_date: form.publish_date || null,
      details_url: form.details_url.trim() || null,
      copy_approved: false,
      files_url: form.files_url.trim() || null,
      deliverables_url: form.deliverables_url.trim() || null,
      assigned_to: form.assigned_to,
      edit_notes: form.edit_notes.trim() || null,
      channel_tags: parseChannels(form.channels),
      source: "manual",
      intake_reviewed: true,
    };

    const { data, error } = await supabase
      .from("projects")
      .insert(payload)
      .select(selectColumns)
      .single();

    if (error) {
      errorMessage = error.message;
      saving = false;
      return;
    }

    saving = false;
    onCreated(data);
    onClose();
  }
</script>

<SlideOver {open} title="New project" eyebrow="Create" {onClose} closeDisabled={saving}>
  <form class="space-y-4 px-5 py-5" onsubmit={submit}>
    {#if errorMessage}
      <Banner tone="error" message={errorMessage} />
    {/if}

    <Field label="Project name" id="create-title" required>
      <input
        id="create-title"
        class="input"
        bind:value={form.title}
        placeholder="e.g. Monday Miles: New Tank Drop"
        required
      />
    </Field>

    <div class="grid gap-4 sm:grid-cols-2">
      <Field label="Status" id="create-status">
        <select id="create-status" class="select" bind:value={form.status}>
          {#each statusOptions as status}
            <option value={status}>{status}</option>
          {/each}
        </select>
      </Field>

      <Field label="Priority" id="create-priority">
        <select id="create-priority" class="select" bind:value={form.priority}>
          <option value="">No priority</option>
          <option value="P0">P0</option>
          <option value="P1">P1</option>
          <option value="P2">P2</option>
        </select>
      </Field>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <Field label="Deadline" id="create-deadline">
        <input id="create-deadline" type="date" class="input" bind:value={form.deadline} />
      </Field>
      <Field label="Publish date" id="create-publish">
        <input id="create-publish" type="date" class="input" bind:value={form.publish_date} />
      </Field>
    </div>

    <Field label="Channels" id="create-channels" hint="Comma-separated, e.g. IG, TikTok, Newsletter">
      <input id="create-channels" class="input" bind:value={form.channels} placeholder="IG, TikTok" />
    </Field>

    <Field label="Brief / details link" id="create-details" hint="Leave blank to auto-generate a Project Brief Doc">
      <input id="create-details" class="input" bind:value={form.details_url} placeholder="https://…" />
    </Field>

    <div class="grid gap-4 sm:grid-cols-2">
      <Field label="Files link" id="create-files">
        <input id="create-files" class="input" bind:value={form.files_url} placeholder="https://…" />
      </Field>
      <Field label="Deliverables link" id="create-deliverables">
        <input id="create-deliverables" class="input" bind:value={form.deliverables_url} placeholder="https://…" />
      </Field>
    </div>

    <Field label="Notes" id="create-notes">
      <textarea id="create-notes" class="input" rows="3" bind:value={form.edit_notes} placeholder="Brief context for the team"></textarea>
    </Field>

    {#if teamMembers.length}
      <Field label="Assign teammates (optional)" id="create-assignees">
        <div class="mt-1 grid max-h-44 gap-1.5 overflow-y-auto rounded-control border border-ink/12 p-2">
          {#each teamMembers as member}
            <label class="flex items-center gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-ink/[0.03]">
              <input
                type="checkbox"
                checked={form.assigned_to.includes(member.email)}
                onchange={() => toggleAssignee(member.email)}
              />
              <span class="truncate text-ink">
                {member.full_name || member.email}
                {#if member.email === currentUserEmail}<span class="text-ink/50">(you)</span>{/if}
              </span>
            </label>
          {/each}
        </div>
      </Field>
    {/if}

    <div class="flex items-center justify-end gap-2 border-t border-ink/8 pt-4">
      <Button variant="ghost" type="button" onclick={onClose} disabled={saving}>Cancel</Button>
      <Button variant="primary" type="submit" loading={saving} disabled={saving}>
        Create project
      </Button>
    </div>
  </form>
</SlideOver>
