<script>
  // Write or edit a kiosk check-in message, with a live preview of exactly
  // what the iPad will put in front of staff.
  import SlideOver from "../marketing/SlideOver.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import Field from "../ui/Field.svelte";
  import KioskMessagePreview from "./KioskMessagePreview.svelte";
  import {
    AUDIENCE_OPTIONS,
    employeeLabel,
  } from "../../../lib/dashboard/timeclock";

  export let supabase;
  export let profile = null;
  export let employees = []; // full roster; filtered to active below
  export let open = false;
  export let message = null; // null = create mode
  export let nextSortOrder = 0;
  export let onClose = () => {};
  export let onSaved = () => {};

  let drawerOpen = false;
  let formKey = "";
  let isSaving = false;
  let errorMessage = "";
  let fieldError = "";

  let title = "";
  let body = "";
  let audience = "all";
  let employeeId = "";
  let startsOn = "";
  let endsOn = "";
  let sortOrder = 0;
  let isActive = true;

  $: isCreate = !message?.id;

  $: syncFromProps(open, message);
  $: if (!open && drawerOpen && !isSaving) {
    drawerOpen = false;
  }

  function syncFromProps(isOpen, target) {
    if (!isOpen) return;
    const key = target?.id || "__new__";
    if (key === formKey && drawerOpen) return;
    formKey = key;
    buildForm(target);
    drawerOpen = true;
  }

  function buildForm(target) {
    errorMessage = "";
    fieldError = "";

    title = target?.title || "";
    body = target?.body || "";
    audience = target?.audience || "all";
    employeeId = target?.employee_id || "";
    startsOn = target?.starts_on || "";
    endsOn = target?.ends_on || "";
    sortOrder = target?.sort_order ?? nextSortOrder;
    isActive = target ? Boolean(target.is_active) : true;
  }

  function requestClose() {
    if (isSaving) return;
    drawerOpen = false;
  }

  function handleClosed() {
    drawerOpen = false;
    formKey = "";
    onClose();
  }

  $: targetEmployee = employees.find((employee) => employee.id === employeeId) || null;
  $: previewPersonName = targetEmployee ? employeeLabel(targetEmployee) : "";
  // Keep the currently targeted person selectable even if they were since
  // deactivated, so editing a message never silently drops its target.
  $: selectableEmployees = employees.filter(
    (employee) => employee.is_active || employee.id === employeeId,
  );

  function validate() {
    if (!body.trim()) return "A message needs a body — that is what staff read.";
    if (startsOn && endsOn && startsOn > endsOn) {
      return "The start date is after the end date.";
    }
    return "";
  }

  async function save() {
    if (isSaving) return;

    fieldError = validate();
    if (fieldError) return;

    isSaving = true;
    errorMessage = "";

    const payload = {
      title: title.trim(),
      body: body.trim(),
      audience,
      // Targeting one person narrows the audience; an empty select means the
      // audience role applies on its own.
      employee_id: employeeId || null,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      sort_order: Number(sortOrder) || 0,
      is_active: isActive,
    };

    // updated_at is stamped by a server trigger; never send it.
    const { error } = isCreate
      ? await supabase
          .from("timeclock_messages")
          .insert({ ...payload, created_by: profile?.id || null })
      : await supabase
          .from("timeclock_messages")
          .update(payload)
          .eq("id", message.id);

    isSaving = false;

    if (error) {
      errorMessage = error.message;
      return;
    }

    drawerOpen = false;
    onSaved();
  }
</script>

<SlideOver
  open={drawerOpen}
  title={isCreate ? "New check-in message" : title || "Edit message"}
  eyebrow="Studio iPad announcement"
  closeLabel="Close message editor"
  closeDisabled={isSaving}
  width="min(100vw, 36rem)"
  onClose={requestClose}
  onClosed={handleClosed}
>
  <div class="space-y-4 px-5 py-5">
    {#if errorMessage}
      <Banner tone="error" message={errorMessage} />
    {/if}

    <Field label="Title" id="message-title" hint="Short and scannable — it is the headline on the card">
      <input
        id="message-title"
        class="input"
        bind:value={title}
        disabled={isSaving}
        placeholder="New towel policy"
      />
    </Field>

    <Field label="Message" id="message-body" required>
      <textarea
        id="message-body"
        class="textarea"
        rows="5"
        bind:value={body}
        disabled={isSaving}
        placeholder="Please restock the towel bin before you clock out. Thank you!"
      ></textarea>
    </Field>

    <div class="grid gap-4 sm:grid-cols-2">
      <Field label="Audience" id="message-audience">
        <select id="message-audience" class="select" bind:value={audience} disabled={isSaving}>
          {#each AUDIENCE_OPTIONS as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </Field>
      <Field
        label="Just one person"
        id="message-employee"
        hint="Optional. Overrides the audience for a private note."
      >
        <select id="message-employee" class="select" bind:value={employeeId} disabled={isSaving}>
          <option value="">Everyone in the audience</option>
          {#each selectableEmployees as employee (employee.id)}
            <option value={employee.id}>{employeeLabel(employee)}</option>
          {/each}
        </select>
      </Field>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <Field label="Starts on" id="message-starts" hint="Blank = show right away">
        <input
          id="message-starts"
          type="date"
          class="input"
          bind:value={startsOn}
          disabled={isSaving}
        />
      </Field>
      <Field label="Ends on" id="message-ends" hint="Blank = show until turned off">
        <input
          id="message-ends"
          type="date"
          class="input"
          bind:value={endsOn}
          disabled={isSaving}
        />
      </Field>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <Field label="Sort order" id="message-sort" hint="Lower numbers show first">
        <input
          id="message-sort"
          type="number"
          class="input"
          bind:value={sortOrder}
          disabled={isSaving}
        />
      </Field>
      <div class="flex items-end">
        <label class="flex w-full items-start gap-3 rounded-control border border-ink/10 bg-white px-4 py-3">
          <input
            type="checkbox"
            class="mt-0.5 h-4 w-4 accent-[#0f766e]"
            bind:checked={isActive}
            disabled={isSaving}
          />
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-ink">Active</span>
            <span class="block text-xs leading-5 text-ink/55">Show this at the studio</span>
          </span>
        </label>
      </div>
    </div>

    <div>
      <p class="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-ink/55">
        Kiosk preview
      </p>
      <KioskMessagePreview {title} {body} {audience} personName={previewPersonName} />
    </div>

    {#if fieldError}
      <Banner tone="warning" message={fieldError} onDismiss={() => (fieldError = "")} />
    {/if}

    <div class="flex items-center justify-end gap-2 border-t border-ink/8 pt-4">
      <Button variant="ghost" disabled={isSaving} onclick={requestClose}>Cancel</Button>
      <Button variant="primary" loading={isSaving} onclick={save}>
        {isCreate ? "Post message" : "Save changes"}
      </Button>
    </div>
  </div>
</SlideOver>
