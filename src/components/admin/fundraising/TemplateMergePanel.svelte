<script>
  // "Send with a template": pick an email template, see it filled in with this
  // donor's details, copy it or open the mail app, then log it as sent so the
  // contact history stays honest. Rendered inside DonorDrawer (and anywhere
  // else a donor + template list are on hand).
  import { Check, Copy, Mail, Send } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Button from "../ui/Button.svelte";
  import {
    fillTemplate,
    listPlaceholders,
    mergeValuesForDonor,
  } from "../../../lib/dashboard/fundraisingCrm";

  export let donor = null;
  export let templates = [];
  export let currentUserName = "";
  export let logging = false;
  // Called with { template, subject, body } when the user logs the send.
  export let onLogSend = () => {};

  let selectedTemplateId = "";
  let copied = "";
  let copiedTimer;
  let copyErrorMessage = "";

  // Roughly where common mail apps start truncating mailto bodies.
  const MAILTO_SAFE_LENGTH = 1800;

  $: emailTemplates = templates.filter((template) => template.kind === "email");
  $: selectedTemplate =
    emailTemplates.find((template) => template.id === selectedTemplateId) || null;
  $: mergeValues = mergeValuesForDonor(donor, currentUserName);
  $: mergedSubject = selectedTemplate
    ? fillTemplate(selectedTemplate.subject || "", mergeValues)
    : "";
  $: mergedBody = selectedTemplate ? fillTemplate(selectedTemplate.body, mergeValues) : "";
  $: unresolved = listPlaceholders(`${mergedSubject}\n${mergedBody}`);
  $: mailtoHref = buildMailto(donor?.email, mergedSubject, mergedBody);
  $: mailtoMayTruncate = mailtoHref.length > MAILTO_SAFE_LENGTH;

  function buildMailto(email, subject, body) {
    if (!email) return "";
    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    if (body) params.set("body", body);
    const query = params.toString().replace(/\+/g, "%20");
    return `mailto:${email}${query ? `?${query}` : ""}`;
  }

  async function copyText(label, text) {
    try {
      await navigator.clipboard.writeText(text);
      copied = label;
      copyErrorMessage = "";
      window.clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => (copied = ""), 2000);
    } catch {
      copyErrorMessage =
        "Copying isn't available in this browser. Select the text above manually.";
    }
  }

  function handleLogSend() {
    if (!selectedTemplate) return;
    onLogSend({
      template: selectedTemplate,
      subject: mergedSubject,
      body: mergedBody,
    });
  }
</script>

<section class="rounded-control border border-ink/8 bg-white p-4" aria-labelledby="template-merge-title">
  <h4 id="template-merge-title" class="font-bold text-ink">Send with a template</h4>

  {#if emailTemplates.length}
    <label class="mt-3 block">
      <span class="sr-only">Choose a template</span>
      <select class="select" bind:value={selectedTemplateId}>
        <option value="">Choose a template…</option>
        {#each emailTemplates as template (template.id)}
          <option value={template.id}>{template.category} · {template.title}</option>
        {/each}
      </select>
    </label>

    {#if selectedTemplate}
      {#if unresolved.length}
        <p class="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-amber-800">
          Still needs a human:
          {#each unresolved as token (token)}
            <Badge tone="amber" size="xs">{token}</Badge>
          {/each}
        </p>
      {/if}

      {#if mergedSubject}
        <div class="mt-3 rounded-control border border-ink/8 bg-canvas/60 px-3 py-2.5">
          <p class="text-xs font-bold uppercase tracking-[0.12em] text-ink/50">Subject</p>
          <p class="mt-1 text-sm font-semibold text-ink">{mergedSubject}</p>
        </div>
      {/if}

      <div class="mt-2 max-h-64 overflow-y-auto rounded-control border border-ink/8 bg-canvas/40 px-3 py-2.5">
        <p class="whitespace-pre-wrap text-sm leading-6 text-ink/80">{mergedBody}</p>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2">
        {#if mergedSubject}
          <Button
            size="sm"
            icon={copied === "subject" ? Check : Copy}
            class="w-full"
            onclick={() => copyText("subject", mergedSubject)}
          >
            {copied === "subject" ? "Copied" : "Copy subject"}
          </Button>
        {/if}
        <Button
          size="sm"
          icon={copied === "body" ? Check : Copy}
          class="w-full {mergedSubject ? '' : 'col-span-2'}"
          onclick={() => copyText("body", mergedBody)}
        >
          {copied === "body" ? "Copied" : "Copy body"}
        </Button>
        {#if mailtoHref}
          <Button size="sm" icon={Mail} href={mailtoHref} class="w-full">
            Open in email app
          </Button>
        {/if}
        <Button
          size="sm"
          variant="primary"
          icon={Send}
          class="w-full {mailtoHref ? '' : 'col-span-2'}"
          loading={logging}
          onclick={handleLogSend}
        >
          Log as sent
        </Button>
      </div>
      {#if copyErrorMessage}
        <p class="mt-2 text-xs font-semibold leading-5 text-red-700">{copyErrorMessage}</p>
      {/if}
      {#if mailtoMayTruncate}
        <p class="mt-2 text-xs leading-5 text-amber-800">
          Long template: some email apps cut off the pasted text when opening
          from a link. If the draft looks short, use "Copy body" instead.
        </p>
      {/if}
      <p class="mt-2 text-xs leading-5 text-ink/50">
        "Log as sent" adds an email entry to the contact log (and updates any
        outreach lists this donor is on) without sending anything itself.
      </p>
    {/if}
  {:else}
    <p class="mt-2 text-sm leading-6 text-ink/55">
      No email templates in the library yet. Add one in the Templates tab.
    </p>
  {/if}
</section>
