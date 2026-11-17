<script>
  // /givingtuesday/join sign-up form. Loads signup_open, prize_label and the
  // Turnstile site key from giving_public, then posts to the giving-signup
  // edge function (pattern of InventoryLogApp.svelte: Turnstile rendered
  // explicitly, non-2xx read from error.context.json()).
  import { onMount, tick } from "svelte";
  import { givingJoinCopy as copy, givingRoutes as routes, fill } from "../../data/givingTuesday.js";
  import { fetchGivingPublic, submitSignup, mockParams } from "../../lib/givingTuesday/live.js";
  import { GIVING_SLUG } from "../../data/givingTuesday.js";

  let { base = "/" } = $props();

  const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  const MESSAGES = {
    invalid_name: "Please enter your first and last name.",
    invalid_email: "That email doesn't look right. Please check it.",
    invalid_cohort: "Please choose LSP instructor, 2026 YTT cohort, or both.",
    invalid_why: `Please keep your note to ${copy.whyMax} characters.`,
    consent_required: "Please check the box so we can set up your giving page.",
    captcha_missing: "Please complete the security check.",
    captcha_failed: "The security check didn't pass. Please try it again.",
    signup_closed: "Sign-ups just closed. Thank you for wanting to help.",
    not_found: "This sign-up isn't set up yet. Please let the LSP team know.",
    network: "We couldn't reach the server. Check your connection and try again.",
  };
  const FIELD_OF = { invalid_name: "name", invalid_email: "email", invalid_cohort: "cohort", invalid_why: "why", consent_required: "consent" };

  let loading = $state(true);
  let loadError = $state(false);
  let signupOpen = $state(true);
  let prize = $state(null);
  let siteKey = $state(null);
  let mock = $state(false);

  let firstName = $state("");
  let lastName = $state("");
  let email = $state("");
  let phone = $state("");
  let cohort = $state("");
  let why = $state("");
  let showOnBoard = $state(true);
  let consentPage = $state(false);

  let token = $state("");
  let widgetId = null;
  let tsBox = $state(null);

  let tried = $state(false);
  let sending = $state(false);
  let serverError = $state("");
  let serverField = $state("");
  let done = $state(false);
  let doneFirst = $state("");
  let doneEmail = $state("");

  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  const errors = $derived({
    first: !firstName.trim() ? "Please enter your first name." : "",
    last: !lastName.trim() ? "Please enter your last name." : "",
    email: !email.trim() ? "Please enter your email." : !emailOk(email) ? MESSAGES.invalid_email : "",
    cohort: !cohort ? "Please choose one." : "",
    why: why.length > copy.whyMax ? MESSAGES.invalid_why : "",
    consent: !consentPage ? MESSAGES.consent_required : "",
  });
  const valid = $derived(!Object.values(errors).some(Boolean));
  const whyLeft = $derived(copy.whyMax - why.length);

  async function load() {
    loading = true;
    loadError = false;
    try {
      const d = await fetchGivingPublic();
      signupOpen = d.campaign?.signup_open !== false;
      prize = d.campaign?.prize_label || null;
      siteKey = d.turnstile_site_key || null;
    } catch {
      loadError = true;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    mock = !!mockParams();
    load();
  });

  function renderTurnstile() {
    if (!siteKey || !tsBox || widgetId !== null) return;
    if (mock) {
      token = "mock";
      return;
    }
    const go = () => {
      if (!window.turnstile || widgetId !== null || !tsBox) return;
      widgetId = window.turnstile.render(tsBox, {
        sitekey: siteKey,
        callback: (t) => (token = t),
        "expired-callback": () => (token = ""),
        "error-callback": () => (token = ""),
      });
    };
    if (window.turnstile) return go();
    let s = document.querySelector(`script[src="${TURNSTILE_SRC}"]`);
    if (!s) {
      s = document.createElement("script");
      s.src = TURNSTILE_SRC;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    s.addEventListener("load", go);
  }
  function resetTurnstile() {
    if (mock) return;
    token = "";
    if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
  }

  $effect(() => {
    if (!loading && signupOpen && !done && siteKey && tsBox) renderTurnstile();
  });

  async function submit(e) {
    e.preventDefault();
    tried = true;
    serverError = "";
    serverField = "";
    if (!valid) {
      await tick();
      const first = document.querySelector(".gj-form [aria-invalid='true']");
      first?.focus();
      return;
    }
    if (!token) {
      serverError = MESSAGES.captcha_missing;
      return;
    }
    sending = true;
    const res = await submitSignup({
      campaign: GIVING_SLUG,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      cohort,
      why: why.trim(),
      showOnBoard,
      consentPage,
      turnstileToken: token,
    });
    sending = false;
    if (res.ok) {
      doneFirst = firstName.trim();
      doneEmail = email.trim();
      done = true;
      await tick();
      document.querySelector(".gj-done")?.focus({ preventScroll: true });
      window.scrollTo({ top: document.querySelector(".gj-formcol")?.offsetTop - 80 || 0, behavior: "smooth" });
      return;
    }
    if (res.reason === "signup_closed") signupOpen = false;
    serverField = FIELD_OF[res.reason] || "";
    serverError = MESSAGES[res.reason] || "Something went wrong sending your sign-up. Please try again.";
    resetTurnstile();
  }

  const show = (key) => tried && errors[key];
</script>

<div class="gj-formcol">
  {#if loading}
    <p class="gj-status" role="status">Loading the sign-up form…</p>
  {:else if loadError}
    <div class="gj-status">
      <p>We couldn't load the sign-up form. Check your connection and try again.</p>
      <button type="button" class="gj-btn gj-btn-line" onclick={load}>Try again</button>
    </div>
  {:else if done}
    <div class="gj-done" role="status" tabindex="-1">
      <h2 class="gj-h2">{fill(copy.successTitle, { first: doneFirst })}</h2>
      <p>{fill(copy.successBody, { email: doneEmail })}</p>
      <a class="gj-btn" href={`${base}${routes.page.replace(/^\//, "")}`}>{copy.successBack}</a>
    </div>
  {:else if !signupOpen}
    <div class="gj-done">
      <h2 class="gj-h2">{copy.closedTitle}</h2>
      <p>{copy.closedBody}</p>
      <a class="gj-btn" href={`${base}${routes.page.replace(/^\//, "")}`}>{copy.successBack}</a>
    </div>
  {:else}
    {#if prize}
      <p class="gj-prize">{fill(copy.prize, { prize })}</p>
    {/if}
    <form class="gj-form" novalidate onsubmit={submit} aria-labelledby="gj-form-h">
      <h2 id="gj-form-h" class="gj-h2">{copy.formTitle}</h2>

      <div class="gj-pair">
        <div class="gj-field">
          <label for="gj-first">First name</label>
          <input id="gj-first" type="text" autocomplete="given-name" maxlength="60" bind:value={firstName}
            aria-invalid={show("first") ? "true" : undefined} aria-describedby={show("first") ? "gj-first-e" : undefined} />
          {#if show("first")}<p class="gj-err" id="gj-first-e">{errors.first}</p>{/if}
        </div>
        <div class="gj-field">
          <label for="gj-last">Last name</label>
          <input id="gj-last" type="text" autocomplete="family-name" maxlength="60" bind:value={lastName}
            aria-invalid={show("last") ? "true" : undefined} aria-describedby={show("last") ? "gj-last-e" : undefined} />
          {#if show("last")}<p class="gj-err" id="gj-last-e">{errors.last}</p>{/if}
        </div>
      </div>

      <div class="gj-field">
        <label for="gj-email">Email</label>
        <input id="gj-email" type="email" autocomplete="email" inputmode="email" maxlength="200" bind:value={email}
          aria-invalid={show("email") || serverField === "email" ? "true" : undefined} aria-describedby={show("email") ? "gj-email-e" : "gj-email-h"} />
        {#if show("email")}<p class="gj-err" id="gj-email-e">{errors.email}</p>{:else}<p class="gj-hint" id="gj-email-h">Your giving page link comes to this address.</p>{/if}
      </div>

      <div class="gj-field">
        <label for="gj-phone">Phone <span class="gj-opt">(optional)</span></label>
        <input id="gj-phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" bind:value={phone} />
      </div>

      <div class="gj-field">
        <label for="gj-cohort">I am</label>
        <select id="gj-cohort" bind:value={cohort}
          aria-invalid={show("cohort") ? "true" : undefined} aria-describedby={show("cohort") ? "gj-cohort-e" : undefined}>
          <option value="" disabled>Choose one</option>
          {#each copy.cohorts as c}
            <option value={c.value}>{c.label}</option>
          {/each}
        </select>
        {#if show("cohort")}<p class="gj-err" id="gj-cohort-e">{errors.cohort}</p>{/if}
      </div>

      <div class="gj-field">
        <label for="gj-why">Why I'm fundraising <span class="gj-opt">(optional)</span></label>
        <textarea id="gj-why" rows="3" bind:value={why} maxlength={copy.whyMax + 40}
          aria-invalid={why.length > copy.whyMax ? "true" : undefined} aria-describedby="gj-why-c"></textarea>
        <p class="gj-count" class:gj-count-over={whyLeft < 0} id="gj-why-c" aria-live="polite">
          {whyLeft >= 0 ? `${whyLeft} characters left` : `${-whyLeft} over the limit`}
        </p>
      </div>

      <label class="gj-check">
        <input type="checkbox" bind:checked={showOnBoard} />
        <span>Show my name and total on the Giving Tuesday page</span>
      </label>

      <label class="gj-check" class:gj-check-bad={show("consent")}>
        <input type="checkbox" bind:checked={consentPage}
          aria-invalid={show("consent") ? "true" : undefined} aria-describedby={show("consent") ? "gj-consent-e" : undefined} />
        <span>Set up my giving page for me with this email</span>
      </label>
      {#if show("consent")}<p class="gj-err gj-err-check" id="gj-consent-e">{errors.consent}</p>{/if}

      <div class="gj-ts">
        {#if siteKey}
          {#if mock}<p class="gj-hint">Security check skipped in the dev mock.</p>{/if}
          <div bind:this={tsBox}></div>
        {:else}
          <p class="gj-err">The security check isn't set up yet, so the form can't be sent. Please let the LSP team know.</p>
        {/if}
      </div>

      {#if serverError}
        <p class="gj-err gj-err-server" role="alert">{serverError}</p>
      {/if}

      <button type="submit" class="gj-btn gj-submit" disabled={sending || !siteKey} aria-busy={sending}>
        {sending ? "Sending…" : "Sign me up"}
      </button>
    </form>
  {/if}
</div>

<style>
  .gj-formcol { width: 100%; }
  .gj-h2 {
    margin: 0 0 24px;
    font-weight: 700;
    font-size: clamp(1.75rem, 6vw, 2.5rem);
    line-height: 1.1;
    letter-spacing: -0.02em;
  }
  .gj-status { font-size: 1.125rem; padding: 24px 0; }
  .gj-status p { margin: 0 0 16px; }
  .gj-prize { margin: 0 0 28px; font-weight: 700; font-size: 1.125rem; }
  .gj-form { display: grid; gap: 22px; }
  .gj-pair { display: grid; gap: 22px; }
  @media (min-width: 560px) { .gj-pair { grid-template-columns: 1fr 1fr; gap: 16px; } }
  .gj-field { display: grid; gap: 8px; min-width: 0; }
  label { font-weight: 700; font-size: 1.0625rem; }
  .gj-opt { font-weight: 400; color: var(--gt-soft); }
  input[type="text"],
  input[type="email"],
  input[type="tel"],
  select,
  textarea {
    width: 100%;
    min-height: 52px;
    padding: 12px 14px;
    border: 2px solid rgba(30, 30, 30, 0.28);
    border-radius: 8px;
    background: #fff;
    color: var(--gt-ink);
    font: inherit;
    font-size: 1.0625rem;
  }
  select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='9' viewBox='0 0 14 9'%3E%3Cpath d='M1 1l6 6 6-6' fill='none' stroke='%231e1e1e' stroke-width='2'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 16px center; padding-right: 44px; }
  textarea { resize: vertical; line-height: 1.45; }
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 3px solid var(--gt-ink);
    outline-offset: 1px;
    border-color: var(--gt-ink);
  }
  [aria-invalid="true"] { border-color: var(--gt-bad) !important; }
  .gj-err { margin: 0; color: var(--gt-bad); font-size: 0.9375rem; font-weight: 500; }
  .gj-err-check { margin-top: -12px; }
  .gj-err-server { font-size: 1rem; }
  .gj-hint { margin: 0; color: var(--gt-soft); font-size: 0.9375rem; }
  .gj-count { margin: 0; color: var(--gt-soft); font-size: 0.9375rem; text-align: right; font-variant-numeric: tabular-nums; }
  .gj-count-over { color: var(--gt-bad); font-weight: 500; }
  .gj-check {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 12px;
    align-items: start;
    font-weight: 400;
    font-size: 1.0625rem;
    line-height: 1.4;
    cursor: pointer;
    min-height: 44px;
    padding-top: 2px;
  }
  .gj-check input {
    width: 24px;
    height: 24px;
    margin: 0;
    accent-color: var(--gt-ink);
    cursor: pointer;
  }
  .gj-check-bad span { color: var(--gt-bad); }
  .gj-ts { min-height: 65px; }
  .gj-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 56px;
    padding: 0 32px;
    border: 0;
    border-radius: 8px;
    background: var(--gt-ink);
    color: #fff;
    font: inherit;
    font-weight: 700;
    font-size: 1.1875rem;
    text-decoration: none;
    cursor: pointer;
  }
  .gj-btn:focus-visible { outline: 3px solid var(--gt-ink); outline-offset: 3px; }
  .gj-btn[disabled] { opacity: 0.55; cursor: progress; }
  .gj-btn-line { background: transparent; color: var(--gt-ink); border: 2px solid var(--gt-ink); }
  .gj-submit { width: 100%; }
  @media (min-width: 560px) { .gj-submit { width: auto; min-width: 220px; justify-self: start; } }
  .gj-done p { margin: 0 0 28px; font-size: 1.1875rem; line-height: 1.5; max-width: 46ch; overflow-wrap: anywhere; }
  .gj-done:focus { outline: none; }
</style>
