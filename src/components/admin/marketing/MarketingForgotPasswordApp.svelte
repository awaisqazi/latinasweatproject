<script>
  import { AlertCircle, ArrowLeft, CheckCircle2, Mail, Send } from "@lucide/svelte";
  import {
    getSupabaseClient,
    SUPABASE_CONFIG_ERROR,
  } from "../../../lib/supabaseClient";

  let email = "";
  let isSubmitting = false;
  let errorMessage = SUPABASE_CONFIG_ERROR;
  let emailSent = false;

  async function handleResetRequest() {
    errorMessage = "";
    isSubmitting = true;

    try {
      const supabase = getSupabaseClient();
      const redirectTo = new URL(
        "/admin/marketing/reset-password",
        window.location.origin,
      ).toString();

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });

      if (error) {
        errorMessage = error.message;
        return;
      }

      emailSent = true;
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to send a reset email right now.";
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main
  class="min-h-screen bg-[#f6f4ef] text-[#1E1E1E] flex items-center justify-center px-4 py-12"
>
  <section
    class="w-full max-w-[440px] overflow-hidden rounded-lg border border-black/10 bg-white shadow-xl shadow-black/5"
    aria-labelledby="forgot-password-title"
  >
    <div class="bg-[#1E1E1E] px-6 py-7 text-white">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffbd59]">
        The Latina Sweat Project
      </p>
      <h1 id="forgot-password-title" class="mt-3 text-2xl font-bold">
        Reset Your Password
      </h1>
      <p class="mt-2 text-sm leading-6 text-white/72">
        Enter your invited team email and Supabase will send a secure reset link.
      </p>
    </div>

    <div class="px-6 py-6">
      {#if emailSent}
        <div
          class="mb-5 flex gap-3 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            If that email belongs to an invited team account, a password reset
            link is on its way.
          </span>
        </div>

        <a
          href="/admin/marketing/login"
          class="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 py-2.5 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
        >
          <ArrowLeft class="h-4 w-4" aria-hidden="true" />
          Back to Sign In
        </a>
      {:else}
        {#if errorMessage}
          <div
            class="mb-4 flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
            aria-live="polite"
          >
            <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        {/if}

        <form
          class="space-y-4"
          onsubmit={(event) => {
            event.preventDefault();
            handleResetRequest();
          }}
        >
          <div>
            <label for="forgot-password-email" class="block text-sm font-semibold">
              Email
            </label>
            <div class="mt-2 flex items-center rounded-md border border-gray-300 bg-white px-3 focus-within:border-[#0f766e] focus-within:ring-2 focus-within:ring-[#0f766e]/15">
              <Mail class="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
              <input
                id="forgot-password-email"
                type="email"
                autocomplete="email"
                required
                bind:value={email}
                class="min-h-11 w-full border-0 bg-transparent px-3 text-sm outline-none placeholder:text-gray-400"
                placeholder="name@latinasweatproject.com"
                disabled={isSubmitting || Boolean(SUPABASE_CONFIG_ERROR)}
              />
            </div>
          </div>

          <button
            type="submit"
            class="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 py-2.5 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting || Boolean(SUPABASE_CONFIG_ERROR)}
          >
            {#if isSubmitting}
              <span
                class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin"
                aria-hidden="true"
              ></span>
              Sending link
            {:else}
              <Send class="h-4 w-4" aria-hidden="true" />
              Send Reset Link
            {/if}
          </button>

          <a
            href="/admin/marketing/login"
            class="flex min-h-11 items-center justify-center gap-2 rounded-md border border-black/10 px-4 py-2.5 text-sm font-bold text-[#1E1E1E] transition hover:border-[#0f766e]/30 hover:text-[#0f766e]"
          >
            <ArrowLeft class="h-4 w-4" aria-hidden="true" />
            Back to Sign In
          </a>
        </form>
      {/if}
    </div>
  </section>
</main>
