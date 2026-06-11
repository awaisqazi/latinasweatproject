<script>
  import { onMount } from "svelte";
  import {
    AlertCircle,
    CheckCircle2,
    MailPlus,
    RefreshCw,
    Save,
    ShieldAlert,
    ShieldCheck,
  } from "@lucide/svelte";
  import { MODULES, getModuleLabel } from "../../../lib/dashboard/modules";
  import {
    ROLE_ADMIN,
    ROLE_MEMBER,
    ROLE_SUPERUSER,
    getRoleLabel,
    isSuperuser,
  } from "../../../lib/dashboard/roles";
  import AccessGrantsEditor from "./AccessGrantsEditor.svelte";
  import EmptyState from "./EmptyState.svelte";
  import Panel from "./Panel.svelte";
  import SlideOver from "./SlideOver.svelte";

  export let supabase;
  export let profile;
  export let refreshKey = 0;

  const userFunctionUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/marketing-users`;
  const supabasePublishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const roleOptions = [ROLE_MEMBER, ROLE_ADMIN, ROLE_SUPERUSER];

  let users = [];
  let userDrafts = {};
  let inviteForm = getEmptyInviteForm();
  let inviteModules = ["marketing"];
  let selectedUser = null;
  let drawerOpen = false;
  let isLoading = true;
  let isRefreshing = false;
  let invitingUser = false;
  let savingUserId = "";
  let errorMessage = "";
  let successMessage = "";
  let lastRefreshKey = refreshKey;

  $: canManageUsers = isSuperuser(profile);
  $: if (canManageUsers && refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadUsers();
  }
  $: superuserCount = users.filter((user) => user.role === ROLE_SUPERUSER).length;
  $: adminCount = users.filter((user) => user.role === ROLE_ADMIN).length;
  $: invitedCount = users.filter((user) => user.account_status === "invited").length;

  onMount(() => {
    if (canManageUsers) {
      loadUsers();
    } else {
      isLoading = false;
    }
  });

  async function loadUsers() {
    if (!supabase || !canManageUsers) {
      isLoading = false;
      return;
    }

    isRefreshing = true;
    errorMessage = "";

    try {
      const result = await callUserManagementFunction({ method: "GET" });
      users = result.users || [];
      seedDrafts(users);
    } catch (error) {
      errorMessage = error?.message || "User access could not be loaded.";
    } finally {
      isLoading = false;
      isRefreshing = false;
    }
  }

  async function callUserManagementFunction({ method = "GET", body = null } = {}) {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw new Error(error.message);
    }

    if (!data.session?.access_token) {
      throw new Error("Your session expired. Please sign in again.");
    }

    const response = await fetch(userFunctionUrl, {
      method,
      headers: {
        apikey: supabasePublishableKey,
        authorization: `Bearer ${data.session.access_token}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.error || "User management request failed.");
    }

    return result;
  }

  function seedDrafts(nextUsers) {
    const nextDrafts = { ...userDrafts };

    for (const user of nextUsers) {
      nextDrafts[user.id] = userToDraft(user);
    }

    userDrafts = nextDrafts;
  }

  function userToDraft(user) {
    return {
      full_name: user.full_name || "",
      role: user.role || ROLE_MEMBER,
      modules: normalizeModules(user.modules || []),
    };
  }

  function getDraft(userId) {
    return (
      userDrafts[userId] || {
        full_name: "",
        role: ROLE_MEMBER,
        modules: [],
      }
    );
  }

  function updateDraft(userId, field, value) {
    const draft = getDraft(userId);

    userDrafts = {
      ...userDrafts,
      [userId]: {
        ...draft,
        [field]: field === "modules" ? normalizeModules(value) : value,
      },
    };
  }

  function getEmptyInviteForm() {
    return {
      email: "",
      full_name: "",
      role: ROLE_MEMBER,
    };
  }

  function updateInviteForm(field, value) {
    inviteForm = {
      ...inviteForm,
      [field]: value,
    };
  }

  function normalizeModules(modules) {
    const allowed = new Set(MODULES.map((module) => module.key));
    return Array.from(
      new Set(
        (Array.isArray(modules) ? modules : [])
          .map((module) => String(module || "").trim())
          .filter((module) => allowed.has(module)),
      ),
    );
  }

  function sameModules(first, second) {
    return normalizeModules(first).sort().join("|") === normalizeModules(second).sort().join("|");
  }

  function isDraftDirty(user) {
    const draft = getDraft(user.id);

    return (
      (draft.full_name || "") !== (user.full_name || "") ||
      (draft.role || ROLE_MEMBER) !== (user.role || ROLE_MEMBER) ||
      !sameModules(draft.modules, user.modules || [])
    );
  }

  function openUserDrawer(user) {
    selectedUser = user;
    userDrafts = {
      ...userDrafts,
      [user.id]: userToDraft(user),
    };
    drawerOpen = true;
    errorMessage = "";
    successMessage = "";
  }

  function requestCloseDrawer() {
    if (savingUserId) return;
    drawerOpen = false;
  }

  function handleDrawerClose() {
    drawerOpen = false;
    selectedUser = null;
  }

  async function inviteUser(event) {
    event.preventDefault();

    if (!inviteForm.email.trim()) {
      errorMessage = "Enter an email address to invite.";
      return;
    }

    invitingUser = true;
    errorMessage = "";
    successMessage = "";

    try {
      await callUserManagementFunction({
        method: "POST",
        body: {
          action: "invite",
          email: inviteForm.email.trim(),
          full_name: inviteForm.full_name.trim(),
          role: inviteForm.role,
          modules: inviteForm.role === ROLE_SUPERUSER ? [] : inviteModules,
        },
      });

      successMessage = `Invite sent to ${inviteForm.email.trim()}.`;
      inviteForm = getEmptyInviteForm();
      inviteModules = ["marketing"];
      await loadUsers();
    } catch (error) {
      errorMessage = error?.message || "The invite could not be sent right now.";
    } finally {
      invitingUser = false;
    }
  }

  async function saveSelectedUser() {
    if (!selectedUser || !isDraftDirty(selectedUser)) return;

    const draft = getDraft(selectedUser.id);

    savingUserId = selectedUser.id;
    errorMessage = "";
    successMessage = "";

    try {
      const result = await callUserManagementFunction({
        method: "PATCH",
        body: {
          action: "updateProfile",
          userId: selectedUser.id,
          full_name: draft.full_name.trim(),
          role: draft.role,
          modules: draft.role === ROLE_SUPERUSER ? [] : draft.modules,
        },
      });

      const updatedUser = result.user;
      users = users.map((user) => (user.id === updatedUser.id ? updatedUser : user));
      selectedUser = updatedUser;
      userDrafts = {
        ...userDrafts,
        [updatedUser.id]: userToDraft(updatedUser),
      };
      successMessage = `${updatedUser.email} was updated.`;
    } catch (error) {
      errorMessage = error?.message || "The account could not be updated right now.";
    } finally {
      savingUserId = "";
    }
  }

  function getAccountStatusLabel(user) {
    if (user.account_status === "invited") return "Invited";
    if (user.account_status === "pending") return "Pending";
    if (user.account_status === "profile_only") return "Profile only";
    return "Active";
  }

  function getAccountStatusClass(user) {
    if (user.account_status === "invited") return "border-amber-200 bg-amber-50 text-amber-700";
    if (user.account_status === "pending") return "border-blue-200 bg-blue-50 text-blue-700";
    if (user.account_status === "profile_only") return "border-gray-200 bg-gray-50 text-gray-600";
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  function formatShortDateTime(value) {
    if (!value) return "Never";

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  }

  function getAccessLabel(user) {
    if (user.role === ROLE_SUPERUSER) return "All modules";
    const modules = normalizeModules(user.modules || []);
    if (!modules.length) return "No access";
    return modules.map(getModuleLabel).join(", ");
  }
</script>

{#if !canManageUsers}
  <section
    class="rounded-lg border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm"
    aria-labelledby="user-access-unauthorized-title"
    role="alert"
  >
    <div class="flex items-start gap-3">
      <ShieldAlert class="mt-1 h-6 w-6 shrink-0" aria-hidden="true" />
      <div>
        <h3 id="user-access-unauthorized-title" class="text-lg font-bold">
          Unauthorized
        </h3>
        <p class="mt-2 text-sm leading-6">
          User access is available only to superuser profiles.
        </p>
      </div>
    </div>
  </section>
{:else}
  <section class="space-y-5" aria-labelledby="user-access-title">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-[#0f766e]">
          Access controls
        </p>
        <h3 id="user-access-title" class="mt-1 text-2xl font-bold">User Access</h3>
      </div>

      <button
        type="button"
        class="inline-flex min-h-10 w-fit items-center gap-2 rounded-md border border-black/10 bg-white px-3 text-sm font-semibold shadow-sm transition hover:border-[#0f766e]/30 hover:text-[#0f766e] disabled:cursor-not-allowed disabled:opacity-60"
        onclick={loadUsers}
        disabled={isRefreshing}
      >
        <RefreshCw class="h-4 w-4 {isRefreshing ? 'animate-spin' : ''}" aria-hidden="true" />
        Refresh
      </button>
    </div>

    {#if errorMessage}
      <div class="flex gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{errorMessage}</span>
      </div>
    {/if}

    {#if successMessage}
      <div class="flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
        <CheckCircle2 class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{successMessage}</span>
      </div>
    {/if}

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Accounts</p>
        <p class="mt-2 text-3xl font-bold">{users.length}</p>
      </div>
      <div class="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Superusers</p>
        <p class="mt-2 text-3xl font-bold">{superuserCount}</p>
      </div>
      <div class="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Admins</p>
        <p class="mt-2 text-3xl font-bold">{adminCount}</p>
      </div>
      <div class="rounded-lg border border-black/10 bg-white p-4 shadow-sm">
        <p class="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Invited</p>
        <p class="mt-2 text-3xl font-bold">{invitedCount}</p>
      </div>
    </div>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
      <Panel title="Team Accounts" id="user-access-accounts" loading={isLoading || isRefreshing}>
        {#if !users.length && !isLoading}
          <EmptyState
            title="No team accounts yet"
            message="Invite your first dashboard user to assign module access."
          />
        {:else}
          <div class="overflow-x-auto rounded-md border border-black/10">
            <table class="min-w-[54rem] w-full divide-y divide-gray-200 bg-white text-left text-sm">
              <thead class="bg-gray-50 text-xs font-bold uppercase tracking-[0.12em] text-gray-500">
                <tr>
                  <th scope="col" class="px-3 py-3">Person</th>
                  <th scope="col" class="px-3 py-3">Status</th>
                  <th scope="col" class="px-3 py-3">Role</th>
                  <th scope="col" class="px-3 py-3">Access</th>
                  <th scope="col" class="px-3 py-3">Last sign-in</th>
                  <th scope="col" class="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                {#each users as user}
                  <tr class="align-top transition hover:bg-gray-50">
                    <td class="px-3 py-3">
                      <p class="font-bold leading-snug">{user.full_name || user.email}</p>
                      <p class="mt-1 break-words text-xs text-gray-500">{user.email}</p>
                    </td>
                    <td class="px-3 py-3">
                      <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-bold {getAccountStatusClass(user)}">
                        {getAccountStatusLabel(user)}
                      </span>
                      {#if user.invited_at}
                        <p class="mt-1 text-xs text-gray-500">
                          Invited {formatShortDateTime(user.invited_at)}
                        </p>
                      {/if}
                    </td>
                    <td class="px-3 py-3 font-semibold">{getRoleLabel(user.role)}</td>
                    <td class="px-3 py-3">
                      <p class="max-w-xs truncate text-xs font-semibold text-gray-700" title={getAccessLabel(user)}>
                        {getAccessLabel(user)}
                      </p>
                    </td>
                    <td class="px-3 py-3 text-gray-700">{formatShortDateTime(user.last_sign_in_at)}</td>
                    <td class="px-3 py-3">
                      <button
                        type="button"
                        class="inline-flex min-h-10 items-center gap-2 rounded-md border border-black/10 px-3 text-sm font-bold transition hover:border-[#0f766e]/40 hover:text-[#0f766e]"
                        onclick={() => openUserDrawer(user)}
                      >
                        <ShieldCheck class="h-4 w-4" aria-hidden="true" />
                        Manage
                      </button>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </Panel>

      <form
        class="rounded-md border border-black/10 bg-gray-50 p-4"
        onsubmit={inviteUser}
      >
        <div class="flex items-center gap-2">
          <MailPlus class="h-5 w-5 text-[#0f766e]" aria-hidden="true" />
          <h4 class="font-bold">Invite New User</h4>
        </div>

        <label class="mt-4 block text-sm font-bold">
          Email
          <input
            type="email"
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            value={inviteForm.email}
            autocomplete="email"
            required
            oninput={(event) => updateInviteForm("email", event.currentTarget.value)}
          />
        </label>

        <label class="mt-3 block text-sm font-bold">
          Full name
          <input
            type="text"
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            value={inviteForm.full_name}
            autocomplete="name"
            oninput={(event) => updateInviteForm("full_name", event.currentTarget.value)}
          />
        </label>

        <label class="mt-3 block text-sm font-bold">
          Role
          <select
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            value={inviteForm.role}
            onchange={(event) => updateInviteForm("role", event.currentTarget.value)}
          >
            {#each roleOptions as role}
              <option value={role}>{getRoleLabel(role)}</option>
            {/each}
          </select>
        </label>

        <div class="mt-3">
          <p class="text-sm font-bold">Module access</p>
          <div class="mt-2">
            <AccessGrantsEditor
              grants={inviteModules}
              isSuperuser={inviteForm.role === ROLE_SUPERUSER}
              disabled={invitingUser}
              onChange={(next) => (inviteModules = next)}
            />
          </div>
        </div>

        <button
          type="submit"
          class="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={invitingUser}
        >
          {#if invitingUser}
            <span class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin" aria-hidden="true"></span>
            Sending Invite
          {:else}
            <MailPlus class="h-4 w-4" aria-hidden="true" />
            Send Invite
          {/if}
        </button>
      </form>
    </div>
  </section>

  <SlideOver
    open={drawerOpen}
    title={selectedUser?.full_name || selectedUser?.email || "User access"}
    eyebrow="Account access"
    closeLabel="Close account access"
    closeDisabled={Boolean(savingUserId)}
    onClose={requestCloseDrawer}
    onClosed={handleDrawerClose}
  >
    {#if selectedUser}
      {@const draft = getDraft(selectedUser.id)}
      <div class="space-y-4 px-5 py-5">
        <div class="rounded-md border border-black/10 bg-gray-50 px-4 py-3 text-sm">
          <p class="font-bold">{selectedUser.email}</p>
          <p class="mt-1 text-gray-600">
            {getAccountStatusLabel(selectedUser)} · Last sign-in {formatShortDateTime(selectedUser.last_sign_in_at)}
          </p>
        </div>

        <label class="block text-sm font-bold" for={`access-name-${selectedUser.id}`}>
          Full name
          <input
            id={`access-name-${selectedUser.id}`}
            type="text"
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-normal outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20"
            value={draft.full_name}
            oninput={(event) => updateDraft(selectedUser.id, "full_name", event.currentTarget.value)}
          />
        </label>

        <label class="block text-sm font-bold" for={`access-role-${selectedUser.id}`}>
          Role
          <select
            id={`access-role-${selectedUser.id}`}
            class="mt-2 min-h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
            value={draft.role}
            disabled={selectedUser.id === profile?.id}
            title={selectedUser.id === profile?.id ? "You cannot remove your own superuser access." : undefined}
            onchange={(event) => updateDraft(selectedUser.id, "role", event.currentTarget.value)}
          >
            {#each roleOptions as role}
              <option value={role}>{getRoleLabel(role)}</option>
            {/each}
          </select>
        </label>

        <div>
          <p class="text-sm font-bold">Module access</p>
          <div class="mt-2">
            <AccessGrantsEditor
              grants={draft.modules}
              isSuperuser={draft.role === ROLE_SUPERUSER}
              disabled={Boolean(savingUserId)}
              onChange={(next) => updateDraft(selectedUser.id, "modules", next)}
            />
          </div>
        </div>
      </div>

      <div class="flex gap-2 border-t border-black/10 p-4">
        <button
          type="button"
          class="flex min-h-11 flex-1 items-center justify-center rounded-md border border-black/10 px-4 py-2.5 text-sm font-bold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          onclick={requestCloseDrawer}
          disabled={Boolean(savingUserId)}
        >
          Cancel
        </button>
        <button
          type="button"
          class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[#ffbd59] px-4 py-2.5 text-sm font-bold text-[#1E1E1E] transition hover:bg-[#f4a833] disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#0f766e] focus:ring-offset-2"
          onclick={saveSelectedUser}
          disabled={!isDraftDirty(selectedUser) || savingUserId === selectedUser.id}
        >
          {#if savingUserId === selectedUser.id}
            <span class="h-4 w-4 rounded-full border-2 border-[#1E1E1E] border-t-transparent animate-spin" aria-hidden="true"></span>
            Saving
          {:else}
            <Save class="h-4 w-4" aria-hidden="true" />
            Save
          {/if}
        </button>
      </div>
    {/if}
  </SlideOver>
{/if}
