<script>
  // The LSP Templates & Master CRM library: browsable, searchable, and
  // editable in place. Rows open TemplateDrawer for reading/editing; the
  // donor-facing mail merge lives in DonorDrawer's TemplateMergePanel.
  import { BookOpenText, Mail, Plus, Search } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import TemplateDrawer from "./TemplateDrawer.svelte";

  export let supabase;
  export let templates = [];
  export let currentUserRole = "member";
  export let onTemplatesChanged = () => {};

  let templateSearch = "";
  let categoryFilter = "all";
  let selectedTemplate = null;
  let createRequest = 0;

  $: categories = Array.from(new Set(templates.map((template) => template.category)));
  $: filteredTemplates = filterTemplates(templates, templateSearch, categoryFilter);
  $: groupedTemplates = groupByCategory(filteredTemplates);

  function filterTemplates(list, search, category) {
    const query = search.trim().toLowerCase();
    let result = list;

    if (category !== "all") {
      result = result.filter((template) => template.category === category);
    }
    if (query) {
      result = result.filter((template) =>
        [template.title, template.subject, template.body, template.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      );
    }
    return result;
  }

  function groupByCategory(list) {
    const groups = [];
    const byCategory = new Map();

    for (const template of list) {
      if (!byCategory.has(template.category)) {
        const group = { category: template.category, templates: [] };
        byCategory.set(template.category, group);
        groups.push(group);
      }
      byCategory.get(template.category).templates.push(template);
    }
    return groups;
  }

  function previewLine(template) {
    if (template.subject) return template.subject;
    return template.body.split("\n").find((line) => line.trim()) || "";
  }

  function handleSaved(saved) {
    // Keep the selection in sync with what the drawer is now showing so its
    // prop-driven open logic stays settled on the saved row.
    if (saved?.id) {
      selectedTemplate = saved;
    }
    onTemplatesChanged();
  }

  function handleDeleted() {
    selectedTemplate = null;
    onTemplatesChanged();
  }
</script>

<Panel title="Templates & resources" id="fundraising-templates-title">
  <p class="mb-4 text-sm leading-6 text-ink/60">
    Ready-to-send messages and reference docs from the LSP Templates & Master
    CRM guide. Open a template to read, copy, or edit it. To send one to a
    specific donor with their name filled in, open the donor and use
    "Send with a template".
  </p>

  <div class="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
    <label class="relative block">
      <span class="sr-only">Search templates</span>
      <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
      <input
        type="search"
        class="input pl-9"
        placeholder="Search by title, subject, or content"
        bind:value={templateSearch}
      />
    </label>
    <label class="sm:w-56">
      <span class="sr-only">Filter by category</span>
      <select class="select" bind:value={categoryFilter} aria-label="Filter templates by category">
        <option value="all">All categories</option>
        {#each categories as category (category)}
          <option value={category}>{category}</option>
        {/each}
      </select>
    </label>
    <Button
      variant="primary"
      icon={Plus}
      onclick={() => {
        selectedTemplate = null;
        createRequest += 1;
      }}
    >
      New template
    </Button>
  </div>

  {#if groupedTemplates.length}
    <div class="space-y-5">
      {#each groupedTemplates as group (group.category)}
        <section aria-label={group.category}>
          <h4 class="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-ink/50">
            {group.category}
          </h4>
          <div class="space-y-2">
            {#each group.templates as template (template.id)}
              <button
                type="button"
                class="flex w-full flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3 text-left transition hover:border-accent/40 hover:shadow-card"
                onclick={() => (selectedTemplate = template)}
              >
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-ink" aria-hidden="true">
                  {#if template.kind === "email"}
                    <Mail class="h-4.5 w-4.5" />
                  {:else}
                    <BookOpenText class="h-4.5 w-4.5" />
                  {/if}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-bold leading-snug text-ink">{template.title}</span>
                  <span class="mt-0.5 block truncate text-xs text-ink/55">{previewLine(template)}</span>
                </span>
                <Badge tone={template.kind === "email" ? "blue" : "neutral"} size="xs">
                  {template.kind === "email" ? "Email" : "Reference"}
                </Badge>
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else}
    <EmptyState
      title={templateSearch || categoryFilter !== "all" ? "No matching templates" : "No templates yet"}
      message={templateSearch || categoryFilter !== "all"
        ? "Try a different search or category."
        : "Add your first template to start the shared library."}
    />
  {/if}
</Panel>

<TemplateDrawer
  {supabase}
  template={selectedTemplate}
  {createRequest}
  {categories}
  {currentUserRole}
  onClose={() => {
    selectedTemplate = null;
  }}
  onSaved={handleSaved}
  onDeleted={handleDeleted}
/>
