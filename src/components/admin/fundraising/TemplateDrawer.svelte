<script>
  // Read, edit, or create one library template. Placeholders like
  // [First Name] are highlighted in read mode so writers can spot what needs
  // customizing before they copy. Saves carry the shared optimistic lock.
  import { Check, Copy, PencilLine, Trash2 } from "@lucide/svelte";
  import { isSuperuser } from "../../../lib/dashboard/roles";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import Field from "../ui/Field.svelte";
  import {
    createTemplate,
    deleteTemplate,
    normalizeImageUrls,
    updateTemplate,
  } from "../../../lib/dashboard/fundraisingCrm";

  export let supabase;
  export let template = null;
  // Parent bumps this counter to open a blank create form (works even while
  // another template is on screen); a boolean prop can't distinguish "still
  // true from last time" from "asked again".
  export let createRequest = 0;
  export let categories = [];
  export let currentUserRole = "member";
  export let onClose = () => {};
  export let onSaved = () => {};
  export let onDeleted = () => {};

  const CONFLICT_MESSAGE =
    "Someone else just updated this template, so their latest version has been loaded. Please re-apply your change.";

  let displayedTemplate = null;
  let drawerOpen = false;
  let isCreating = false;
  let lastCreateRequest = 0;
  let editing = false;
  let isSaving = false;
  let isDeleting = false;
  let confirmingDelete = false;
  let errorMessage = "";
  let copied = "";
  let copiedTimer;

  let draftCategory = "";
  let draftTitle = "";
  let draftKind = "email";
  let draftSubject = "";
  let draftBody = "";
  let draftImageUrls = "";

  $: canDelete = isSuperuser(currentUserRole);
  // The drawer only ever closes from inside (its own close buttons), so the
  // controller just answers "which content should be showing".
  $: if (template?.id && template.id !== displayedTemplate?.id) {
    openForTemplate(template);
  }
  $: if (createRequest !== lastCreateRequest) {
    lastCreateRequest = createRequest;
    openForCreate();
  }
  $: bodySegments = splitPlaceholders(displayedTemplate?.body || "");

  function openForTemplate(next) {
    displayedTemplate = next;
    isCreating = false;
    editing = false;
    errorMessage = "";
    seedDrafts(next);
    drawerOpen = true;
  }

  function openForCreate() {
    displayedTemplate = null;
    isCreating = true;
    editing = true;
    errorMessage = "";
    seedDrafts({ category: categories[0] || "", kind: "email" });
    drawerOpen = true;
  }

  function seedDrafts(source) {
    draftCategory = source?.category || "";
    draftTitle = source?.title || "";
    draftKind = source?.kind || "email";
    draftSubject = source?.subject || "";
    draftBody = source?.body || "";
    draftImageUrls = (source?.image_urls || []).join("\n");
  }

  function requestClose() {
    if (isSaving || isDeleting) return;
    drawerOpen = false;
  }

  function handleClosed() {
    drawerOpen = false;
    displayedTemplate = null;
    isCreating = false;
    editing = false;
    onClose();
  }

  function splitPlaceholders(text) {
    return String(text)
      .split(/(\[[^\][]+\])/g)
      .map((part) => ({ text: part, isPlaceholder: /^\[[^\][]+\]$/.test(part) }));
  }

  async function copyToClipboard(label, text) {
    try {
      await navigator.clipboard.writeText(text);
      copied = label;
      window.clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => (copied = ""), 2000);
    } catch {
      errorMessage = "Copying isn't available in this browser. Select the text manually.";
    }
  }

  async function handleSave(event) {
    event?.preventDefault();
    if (isSaving) return;

    if (!draftCategory.trim() || !draftTitle.trim() || !draftBody.trim()) {
      errorMessage = "Category, title, and body are all required.";
      return;
    }

    isSaving = true;
    errorMessage = "";

    const fields = {
      category: draftCategory.trim(),
      title: draftTitle.trim(),
      kind: draftKind,
      subject: draftKind === "email" ? draftSubject.trim() || null : null,
      body: draftBody.trim(),
      image_urls: normalizeImageUrls(draftImageUrls),
    };

    if (isCreating) {
      const { data, error } = await createTemplate(supabase, {
        ...fields,
        imageUrls: fields.image_urls,
      });
      isSaving = false;
      if (error) {
        errorMessage = error.message;
        return;
      }
      displayedTemplate = data;
      isCreating = false;
      editing = false;
      onSaved(data);
      return;
    }

    const { data, error } = await updateTemplate(supabase, displayedTemplate, fields);
    isSaving = false;

    if (error) {
      errorMessage = error.message;
      return;
    }
    if (!data) {
      errorMessage = CONFLICT_MESSAGE;
      const { data: fresh } = await supabase
        .from("fundraising_templates")
        .select(
          "id,category,title,kind,subject,body,sort_order,image_urls,updated_by,created_at,updated_at",
        )
        .eq("id", displayedTemplate.id)
        .maybeSingle();
      if (fresh) {
        displayedTemplate = fresh;
        seedDrafts(fresh);
        onSaved(fresh);
      }
      return;
    }

    displayedTemplate = data;
    editing = false;
    onSaved(data);
  }

  async function handleDelete() {
    if (!displayedTemplate?.id || isDeleting) return;

    isDeleting = true;
    errorMessage = "";

    const { error } = await deleteTemplate(supabase, displayedTemplate.id);
    isDeleting = false;
    confirmingDelete = false;

    if (error) {
      errorMessage = error.message;
      return;
    }

    const deletedId = displayedTemplate.id;
    drawerOpen = false;
    onDeleted(deletedId);
  }
</script>

<SlideOver
  open={drawerOpen}
  title={isCreating ? "New template" : displayedTemplate?.title || ""}
  eyebrow={isCreating ? "Template library" : displayedTemplate?.category || "Template"}
  closeLabel="Close template"
  closeDisabled={isSaving || isDeleting}
  onClose={requestClose}
  onClosed={handleClosed}
>
  <div class="space-y-4 px-5 py-5">
    {#if errorMessage}
      <Banner tone="error" message={errorMessage} />
    {/if}

    {#if editing}
      <form class="space-y-4" onsubmit={handleSave}>
        <div class="grid grid-cols-2 gap-3">
          <Field label="Category" id="template-category" required>
            <input
              id="template-category"
              type="text"
              class="input"
              list="template-category-options"
              placeholder="e.g. Donor Relations"
              bind:value={draftCategory}
            />
            <datalist id="template-category-options">
              {#each categories as category (category)}
                <option value={category}></option>
              {/each}
            </datalist>
          </Field>
          <Field label="Type" id="template-kind">
            <select id="template-kind" class="select" bind:value={draftKind}>
              <option value="email">Email template</option>
              <option value="reference">Reference doc</option>
            </select>
          </Field>
        </div>

        <Field label="Title" id="template-title" required>
          <input id="template-title" type="text" class="input" bind:value={draftTitle} />
        </Field>

        {#if draftKind === "email"}
          <Field label="Subject line" id="template-subject">
            <input
              id="template-subject"
              type="text"
              class="input"
              placeholder="Optional"
              bind:value={draftSubject}
            />
          </Field>
        {/if}

        <Field label="Body" id="template-body" required>
          <textarea
            id="template-body"
            class="textarea font-mono text-[13px] leading-6"
            rows="16"
            bind:value={draftBody}
          ></textarea>
        </Field>

        {#if draftKind === "email"}
          <Field
            label="Attached images"
            id="template-images"
            hint="One image URL per line (e.g. /images/gala/gala-2026-invite-letter.png). They show under the merged email with copy buttons."
          >
            <textarea
              id="template-images"
              class="textarea font-mono text-[13px] leading-6"
              rows="2"
              bind:value={draftImageUrls}
            ></textarea>
          </Field>
        {/if}

        <p class="text-xs leading-5 text-ink/55">
          Square-bracket placeholders like [First Name] or [Your Name] are
          filled in automatically when the template is used from a donor.
        </p>

        <div class="grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            class="w-full"
            disabled={isSaving}
            onclick={() => {
              if (isCreating || !displayedTemplate) {
                requestClose();
              } else {
                seedDrafts(displayedTemplate);
                editing = false;
                errorMessage = "";
              }
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" class="w-full" loading={isSaving}>
            {isSaving ? "Saving" : isCreating ? "Create template" : "Save changes"}
          </Button>
        </div>
      </form>
    {:else if displayedTemplate}
      <div class="flex flex-wrap items-center gap-2">
        <Badge tone={displayedTemplate.kind === "email" ? "blue" : "neutral"}>
          {displayedTemplate.kind === "email" ? "Email template" : "Reference doc"}
        </Badge>
        {#if displayedTemplate.updated_at}
          <span class="text-xs font-semibold text-ink/50">
            Updated {new Intl.DateTimeFormat("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(new Date(displayedTemplate.updated_at))}
          </span>
        {/if}
      </div>

      {#if displayedTemplate.subject}
        <div class="rounded-control border border-ink/8 bg-canvas/60 px-4 py-3">
          <p class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Subject</p>
          <p class="mt-1 text-sm font-semibold text-ink">{displayedTemplate.subject}</p>
        </div>
      {/if}

      <div class="rounded-control border border-ink/8 bg-white px-4 py-3">
        <p class="whitespace-pre-wrap text-sm leading-6 text-ink/85">{#each bodySegments as segment}{#if segment.isPlaceholder}<mark class="rounded bg-amber-100 px-1 py-0.5 font-semibold text-amber-900">{segment.text}</mark>{:else}{segment.text}{/if}{/each}</p>
      </div>

      {#if displayedTemplate.image_urls?.length}
        <div class="grid grid-cols-2 gap-2">
          {#each displayedTemplate.image_urls as url (url)}
            <a href={url} target="_blank" rel="noreferrer" class="block rounded-control border border-ink/8 bg-canvas/40 p-1.5 transition hover:border-accent/40">
              <img src={url} alt="Template attachment" class="max-h-40 w-full rounded object-contain" />
            </a>
          {/each}
        </div>
      {/if}

      <div class="grid grid-cols-2 gap-2">
        {#if displayedTemplate.subject}
          <Button
            icon={copied === "subject" ? Check : Copy}
            class="w-full"
            onclick={() => copyToClipboard("subject", displayedTemplate.subject)}
          >
            {copied === "subject" ? "Copied" : "Copy subject"}
          </Button>
        {/if}
        <Button
          icon={copied === "body" ? Check : Copy}
          class="w-full {displayedTemplate.subject ? '' : 'col-span-2'}"
          onclick={() => copyToClipboard("body", displayedTemplate.body)}
        >
          {copied === "body" ? "Copied" : "Copy body"}
        </Button>
      </div>

      <div class="grid grid-cols-2 gap-2 border-t border-ink/8 pt-4">
        <Button icon={PencilLine} class="w-full" onclick={() => (editing = true)}>
          Edit
        </Button>
        {#if canDelete}
          <Button
            variant="danger"
            icon={Trash2}
            class="w-full"
            loading={isDeleting}
            onclick={() => (confirmingDelete = true)}
          >
            Delete
          </Button>
        {:else}
          <Button variant="secondary" class="w-full" onclick={requestClose}>Close</Button>
        {/if}
      </div>
    {/if}
  </div>
</SlideOver>

<ConfirmDialog
  open={confirmingDelete}
  title="Delete this template?"
  message="This removes it from the shared library for everyone. This can't be undone."
  confirmLabel="Delete template"
  tone="danger"
  busy={isDeleting}
  onCancel={() => (confirmingDelete = false)}
  onConfirm={handleDelete}
/>
