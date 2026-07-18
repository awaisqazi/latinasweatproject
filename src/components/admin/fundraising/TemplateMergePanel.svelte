<script>
  // "Send with a template": pick an email template, see it filled in with this
  // donor's details, copy it or open the mail app, then log it as sent so the
  // contact history stays honest. Rendered inside DonorDrawer (and anywhere
  // else a donor + template list are on hand).
  import { Check, Copy, ExternalLink, Image, Mail, Send } from "@lucide/svelte";
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
  $: attachedImages = selectedTemplate?.image_urls || [];

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

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Copy body = the whole email in one paste: merged text plus the hosted
  // images appended, as rich HTML (with a plain-text fallback).
  async function copyBody() {
    if (!attachedImages.length) {
      await copyText("body", mergedBody);
      return;
    }

    copyErrorMessage = "";
    try {
      const html =
        `<div>${escapeHtml(mergedBody).replace(/\n/g, "<br>")}</div>` +
        attachedImages.map(imageHtml).join("");
      const text =
        mergedBody +
        "\n\n" +
        attachedImages.map((url) => new URL(url, window.location.origin).href).join("\n");
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      copied = "body";
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

  // Copy images as an email-ready HTML snippet pointing at the hosted file.
  // Pasting a raw picture makes Gmail re-upload it in the background, and a
  // send (or second paste) that lands mid-upload leaves broken img-tag text
  // in the delivered email. A hosted-image snippet pastes instantly with
  // nothing to upload.
  function imageHtml(url) {
    const absolute = new URL(url, window.location.origin).href;
    return `<img src="${absolute}" alt="${imageLabel(url)}" width="560" style="max-width:100%;height:auto;display:block;margin:12px 0;">`;
  }

  async function copyImages(urls, copiedKey) {
    copyErrorMessage = "";
    try {
      const html = urls.map(imageHtml).join("");
      const text = urls
        .map((url) => new URL(url, window.location.origin).href)
        .join("\n");
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
      copied = copiedKey;
      window.clearTimeout(copiedTimer);
      copiedTimer = window.setTimeout(() => (copied = ""), 2000);
    } catch {
      copyErrorMessage =
        "Couldn't copy here. Open the image full size and copy it from there instead.";
    }
  }

  function imageLabel(url) {
    const file = String(url).split("/").pop() || "image";
    return file
      .replace(/\.(png|jpe?g|webp|gif)$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
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
          onclick={copyBody}
        >
          {copied === "body" ? "Copied" : attachedImages.length ? "Copy body + images" : "Copy body"}
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
      {#if attachedImages.length}
        <div class="mt-3 space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-ink/50">
              <Image class="h-3.5 w-3.5" aria-hidden="true" />
              Paste these into the email
            </p>
            {#if attachedImages.length > 1}
              <Button
                size="sm"
                icon={copied === "image-all" ? Check : Copy}
                onclick={() => copyImages(attachedImages, "image-all")}
              >
                {copied === "image-all" ? "Copied" : `Copy all ${attachedImages.length} images`}
              </Button>
            {/if}
          </div>
          {#each attachedImages as url, index (url)}
            <div class="rounded-control border border-ink/8 bg-canvas/40 p-2">
              <img
                src={url}
                alt={imageLabel(url)}
                class="max-h-56 w-full rounded object-contain"
              />
              <div class="mt-2 grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  icon={copied === `image-${index}` ? Check : Copy}
                  class="w-full"
                  onclick={() => copyImages([url], `image-${index}`)}
                >
                  {copied === `image-${index}` ? "Copied" : "Copy image"}
                </Button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  class="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-control border border-ink/14 px-3 text-sm font-bold text-ink transition hover:border-accent/40 hover:text-accent-strong"
                >
                  <ExternalLink class="h-4 w-4" aria-hidden="true" />
                  Open full size
                </a>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if attachedImages.length}
        <p class="mt-2 text-xs leading-5 text-ink/50">
          "Copy body + images" puts the whole email (text and pictures) on
          your clipboard in one go. Images paste as the hosted picture with
          nothing to upload, so what you see in the draft is what arrives.
        </p>
      {/if}
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
