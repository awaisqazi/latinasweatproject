<script>
  import { onMount } from "svelte";
  import { LogIn, Mail, LockKeyhole, AlertCircle } from "@lucide/svelte";
  import {
    getSupabaseClient,
    SUPABASE_CONFIG_ERROR,
  } from "../../../lib/supabaseClient";

  const DASHBOARD_PATH = "/admin/marketing";

  let email = "";
  let password = "";
  let isCheckingSession = true;
  let isSubmitting = false;
  let errorMessage = SUPABASE_CONFIG_ERROR;
  let redirectTo = DASHBOARD_PATH;
  let supabase;

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);
    const requestedRedirect = params.get("redirectTo");

    if (
      requestedRedirect?.startsWith("/admin/marketing") &&
      requestedRedirect !== "/admin/marketing/login"
    ) {
      redirectTo = requestedRedirect;
    }

    if (SUPABASE_CONFIG_ERROR) {
      isCheckingSession = false;
      return;
    }

    supabase = getSupabaseClient();

    const { data } = await supabase.auth.getSession();
    if (data.session) {
      window.location.replace(redirectTo);
      return;
    }

    isCheckingSession = false;
  });

  async function handleLogin() {
    errorMessage = "";
    isSubmitting = true;

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        errorMessage =
          "That email and password did not match an invited team account.";
        return;
      }

      window.location.assign(redirectTo);
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to sign in right now.";
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
    aria-labelledby="marketing-login-title"
  >
    <div class="bg-[#1E1E1E] px-6 py-7 text-white">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffbd59]">
        The Latina Sweat Project
      </p>
      <h1 id="marketing-login-title" class="mt-3 text-2xl font-bold">
        Marketing Dashboard
      </h1>
      <p class="mt-2 text-sm leading-6 text-white/72">
        Private team access for campaign planning, approvals, and intake review.
      </p>
    </div>

    <div class="px-6 py-6">
      {#if isCheckingSession}
        <div class="flex items-center gap-3 rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <span
            class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin"
            aria-hidden="true"
          ></span>
          Checking access
        </div>
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
            handleLogin();
          }}
        >
          <div>
            <label for="marketing-email" class="block text-sm font-semibold">
              Email
            </label>
            <div class="mt-2 flex items-center rounded-md border border-gray-300 bg-white px-3 focus-within:border-[#0f766e] focus-within:ring-2 focus-within:ring-[#0f766e]/15">
              <Mail class="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
              <input
                id="marketing-email"
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

          <div>
            <div class="flex items-center justify-between gap-3">
              <label for="marketing-password" class="block text-sm font-semibold">
                Password
              </label>
              <a
                href="/admin/marketing/forgot-password"
                class="text-sm font-semibold text-[#0f766e] underline-offset-4 hover:underline"
              >
                Forgot password?
              </a>
            </div>
            <div class="mt-2 flex items-center rounded-md border border-gray-300 bg-white px-3 focus-within:border-[#0f766e] focus-within:ring-2 focus-within:ring-[#0f766e]/15">
              <LockKeyhole class="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
              <input
                id="marketing-password"
                type="password"
                autocomplete="current-password"
                required
                bind:value={password}
                class="min-h-11 w-full border-0 bg-transparent px-3 text-sm outline-none placeholder:text-gray-400"
                placeholder="Password"
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
              Signing in
            {:else}
              <LogIn class="h-4 w-4" aria-hidden="true" />
              Sign In
            {/if}
          </button>
        </form>
      {/if}
    </div>
  </section>
</main>
