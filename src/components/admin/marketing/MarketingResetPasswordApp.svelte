<script>
  import { onMount } from "svelte";
  import {
    AlertCircle,
    CheckCircle2,
    KeyRound,
    LockKeyhole,
    UserRound,
  } from "@lucide/svelte";
  import {
    getSupabaseClient,
    SUPABASE_CONFIG_ERROR,
  } from "../../../lib/supabaseClient";

  let fullName = "";
  let password = "";
  let confirmPassword = "";
  let isCheckingSession = true;
  let isSubmitting = false;
  let canResetPassword = false;
  let passwordUpdated = false;
  let errorMessage = SUPABASE_CONFIG_ERROR;
  let supabase;
  let currentUser = null;

  onMount(() => {
    if (SUPABASE_CONFIG_ERROR) {
      isCheckingSession = false;
      return;
    }

    supabase = getSupabaseClient();

    const { data: subscriptionData } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY" && session) {
          canResetPassword = true;
          isCheckingSession = false;
          hydrateNameField(session.user);
        }
      },
    );

    confirmRecoverySession();

    return () => {
      subscriptionData.subscription.unsubscribe();
    };
  });

  async function confirmRecoverySession() {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      errorMessage = error.message;
      isCheckingSession = false;
      return;
    }

    if (data.session) {
      currentUser = data.session.user;
      await hydrateNameField(data.session.user);
      canResetPassword = true;
      isCheckingSession = false;
      return;
    }

    window.setTimeout(async () => {
      const { data: retryData } = await supabase.auth.getSession();
      canResetPassword = Boolean(retryData.session);
      currentUser = retryData.session?.user || null;

      if (retryData.session?.user) {
        await hydrateNameField(retryData.session.user);
      }

      isCheckingSession = false;
    }, 900);
  }

  async function hydrateNameField(user) {
    currentUser = user;
    fullName =
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.email?.split("@")[0] ||
      "";

    if (!user?.id) return;

    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (data?.full_name) {
      fullName = data.full_name;
    }
  }

  async function handlePasswordUpdate() {
    errorMessage = "";
    const trimmedName = fullName.trim();

    if (!trimmedName) {
      errorMessage = "Enter your name so the team can recognize your account.";
      return;
    }

    if (password.length < 8) {
      errorMessage = "Use at least 8 characters for the new password.";
      return;
    }

    if (password !== confirmPassword) {
      errorMessage = "The new passwords do not match.";
      return;
    }

    isSubmitting = true;

    try {
      const { data, error } = await supabase.auth.updateUser({
        password,
        data: {
          full_name: trimmedName,
          name: trimmedName,
        },
      });

      if (error) {
        errorMessage = error.message;
        return;
      }

      const userId = data.user?.id || currentUser?.id;

      if (userId) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ full_name: trimmedName })
          .eq("id", userId);

        if (profileError) {
          errorMessage = `Your password was updated, but your name could not be saved: ${profileError.message}`;
          return;
        }
      }

      passwordUpdated = true;
      fullName = "";
      password = "";
      confirmPassword = "";
      await supabase.auth.signOut();
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to update your password right now.";
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
    aria-labelledby="reset-password-title"
  >
    <div class="bg-[#1E1E1E] px-6 py-7 text-white">
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffbd59]">
        The Latina Sweat Project
      </p>
      <h1 id="reset-password-title" class="mt-3 text-2xl font-bold">
        Choose a New Password
      </h1>
      <p class="mt-2 text-sm leading-6 text-white/72">
        Finish your password reset and return to the marketing dashboard.
      </p>
    </div>

    <div class="px-6 py-6">
      {#if isCheckingSession}
        <div class="flex items-center gap-3 rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <span
            class="h-4 w-4 rounded-full border-2 border-[#ffbd59] border-t-transparent animate-spin"
            aria-hidden="true"
          ></span>
          Checking reset link
        </div>
      {:else if passwordUpdated}
        <div
          class="mb-5 flex gap-3 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Your password has been updated. Please sign in again.</span>
        </div>

        <a
          href="/admin/marketing/login"
          class="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 py-2.5 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
        >
          <KeyRound class="h-4 w-4" aria-hidden="true" />
          Back to Sign In
        </a>
      {:else if !canResetPassword}
        <div
          class="mb-5 flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            This reset link is invalid or expired. Request a new password reset
            email.
          </span>
        </div>

        <a
          href="/admin/marketing/forgot-password"
          class="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 py-2.5 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
        >
          <KeyRound class="h-4 w-4" aria-hidden="true" />
          Request New Link
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
            handlePasswordUpdate();
          }}
        >
          <div>
            <label for="full-name" class="block text-sm font-semibold">
              Name
            </label>
            <div class="mt-2 flex items-center rounded-md border border-gray-300 bg-white px-3 focus-within:border-[#0f766e] focus-within:ring-2 focus-within:ring-[#0f766e]/15">
              <UserRound class="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
              <input
                id="full-name"
                type="text"
                autocomplete="name"
                required
                bind:value={fullName}
                class="min-h-11 w-full border-0 bg-transparent px-3 text-sm outline-none placeholder:text-gray-400"
                placeholder="Your name"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div>
            <label for="new-password" class="block text-sm font-semibold">
              New password
            </label>
            <div class="mt-2 flex items-center rounded-md border border-gray-300 bg-white px-3 focus-within:border-[#0f766e] focus-within:ring-2 focus-within:ring-[#0f766e]/15">
              <LockKeyhole class="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
              <input
                id="new-password"
                type="password"
                autocomplete="new-password"
                required
                minlength="8"
                bind:value={password}
                class="min-h-11 w-full border-0 bg-transparent px-3 text-sm outline-none placeholder:text-gray-400"
                placeholder="At least 8 characters"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div>
            <label for="confirm-new-password" class="block text-sm font-semibold">
              Confirm password
            </label>
            <div class="mt-2 flex items-center rounded-md border border-gray-300 bg-white px-3 focus-within:border-[#0f766e] focus-within:ring-2 focus-within:ring-[#0f766e]/15">
              <LockKeyhole class="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
              <input
                id="confirm-new-password"
                type="password"
                autocomplete="new-password"
                required
                minlength="8"
                bind:value={confirmPassword}
                class="min-h-11 w-full border-0 bg-transparent px-3 text-sm outline-none placeholder:text-gray-400"
                placeholder="Repeat new password"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <button
            type="submit"
            class="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 py-2.5 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {#if isSubmitting}
              <span
                class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin"
                aria-hidden="true"
              ></span>
              Updating password
            {:else}
              <KeyRound class="h-4 w-4" aria-hidden="true" />
              Update Password
            {/if}
          </button>
        </form>
      {/if}
    </div>
  </section>
</main>
