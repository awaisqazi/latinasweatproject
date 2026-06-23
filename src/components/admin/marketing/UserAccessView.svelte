<script>
  import { onMount } from "svelte";
  import { MailPlus, MessageSquare, RefreshCw, Save, ShieldCheck } from "@lucide/svelte";
  import { MODULES, getModuleLabel } from "../../../lib/dashboard/modules";
  import {
    getSetting,
    setSetting,
    FEEDBACK_RECIPIENT_KEY,
  } from "../../../lib/dashboard/appSettings";
  import {
    ROLE_ADMIN,
    ROLE_MEMBER,
    ROLE_SUPERUSER,
    getRoleLabel,
    isSuperuser,
  } from "../../../lib/dashboard/roles";
  import AccessGrantsEditor from "./AccessGrantsEditor.svelte";
  import SlideOver from "./SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import DataTable from "../ui/DataTable.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import StatCard from "../ui/StatCard.svelte";

  export let supabase;
  export let profile;
  export let refreshKey = 0;

  const userFunctionUrl = `${import.meta.env.PUBLIC_SUPABASE_URL}/functions/v1/marketing-users`;
  const supabasePublishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const roleOptions = [ROLE_MEMBER, ROLE_ADMIN, ROLE_SUPERUSER];

  const ACCOUNT_STATUS_TONES = {
    active: "green",
    invited: "blue",
    pending: "amber",
    profile_only: "neutral",
  };
  const ROLE_TONES = {
    [ROLE_SUPERUSER]: "gold",
    [ROLE_ADMIN]: "teal",
    [ROLE_MEMBER]: "neutral",
  };
  const accountColumns = [
    { key: "person", label: "Person" },
    { key: "status", label: "Status" },
    { key: "role", label: "Role" },
    { key: "access", label: "Access" },
    { key: "last_sign_in", label: "Last sign-in", hideBelow: "lg" },
    { key: "actions", label: "Actions" },
  ];

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

  let feedbackRecipientId = "";
  let savingFeedbackRecipient = false;
  let feedbackRecipientError = "";
  let feedbackRecipientSaved = false;

  $: canManageUsers = isSuperuser(profile);
  $: if (canManageUsers && refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadUsers();
  }
  $: superuserCount = users.filter((user) => user.role === ROLE_SUPERUSER).length;
  $: adminCount = users.filter((user) => user.role === ROLE_ADMIN).length;
  $: invitedCount = users.filter((user) => user.account_status === "invited").length;

  // Reactive view of the open drawer's draft + whether it differs from the saved
  // user. These reference userDrafts/selectedUser directly so the Save button
  // and form controls re-evaluate the moment a field (e.g. role) changes.
  $: selectedDraft =
    selectedUser && userDrafts[selectedUser.id]
      ? userDrafts[selectedUser.id]
      : { full_name: "", role: ROLE_MEMBER, modules: [] };
  $: selectedDirty =
    Boolean(selectedUser) &&
    ((selectedDraft.full_name || "") !== (selectedUser?.full_name || "") ||
      (selectedDraft.role || ROLE_MEMBER) !== (selectedUser?.role || ROLE_MEMBER) ||
      !sameModules(selectedDraft.modules, selectedUser?.modules || []));

  onMount(() => {
    if (canManageUsers) {
      loadUsers();
      loadFeedbackRecipient();
    } else {
      isLoading = false;
    }
  });

  async function loadFeedbackRecipient() {
    const { value } = await getSetting(supabase, FEEDBACK_RECIPIENT_KEY);
    feedbackRecipientId = typeof value === "string" ? value : "";
  }

  async function saveFeedbackRecipient(nextId) {
    if (!nextId || nextId === feedbackRecipientId) return;

    savingFeedbackRecipient = true;
    feedbackRecipientError = "";
    feedbackRecipientSaved = false;

    const { error } = await setSetting(supabase, FEEDBACK_RECIPIENT_KEY, nextId);

    if (error) {
      feedbackRecipientError = error.message || "Could not update the feedback recipient.";
    } else {
      feedbackRecipientId = nextId;
      feedbackRecipientSaved = true;
      setTimeout(() => (feedbackRecipientSaved = false), 3000);
    }

    savingFeedbackRecipient = false;
  }

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
    if (!selectedUser || !selectedDirty) return;

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

  function getAccountStatusTone(user) {
    return ACCOUNT_STATUS_TONES[user.account_status] || "green";
  }

  function getRoleTone(role) {
    return ROLE_TONES[role] || "neutral";
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
  <Banner tone="error">
    <p class="font-bold">Unauthorized</p>
    <p class="mt-1">User access is available only to superuser profiles.</p>
  </Banner>
{:else}
  <section class="space-y-5" aria-labelledby="user-access-title">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-accent-strong">
          Access controls
        </p>
        <h3 id="user-access-title" class="mt-1 text-2xl font-bold text-ink">User Access</h3>
      </div>

      <Button icon={RefreshCw} loading={isRefreshing} onclick={loadUsers}>
        Refresh
      </Button>
    </div>

    {#if errorMessage}
      <Banner tone="error" message={errorMessage} />
    {/if}

    {#if successMessage}
      <Banner tone="success" message={successMessage} />
    {/if}

    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Accounts" value={users.length} tone="neutral" loading={isLoading} />
      <StatCard label="Superusers" value={superuserCount} tone="gold" loading={isLoading} />
      <StatCard label="Admins" value={adminCount} tone="teal" loading={isLoading} />
      <StatCard label="Invited" value={invitedCount} tone="neutral" loading={isLoading} />
    </div>

    <div class="rounded-card border border-ink/8 bg-canvas/60 p-4">
      <div class="flex items-center gap-2">
        <MessageSquare class="h-5 w-5 text-accent" aria-hidden="true" />
        <h4 class="font-bold text-ink">Feedback delivery</h4>
      </div>
      <p class="mt-1 text-sm text-ink/60">
        The dashboard's <span class="font-semibold">Feedback</span> button delivers each submission to this person's Workspace.
      </p>
      <div class="mt-3 max-w-md">
        <Field label="Feedback recipient" id="feedback-recipient-setting">
          <select
            id="feedback-recipient-setting"
            class="select"
            value={feedbackRecipientId}
            disabled={savingFeedbackRecipient || isLoading}
            onchange={(event) => saveFeedbackRecipient(event.currentTarget.value)}
          >
            {#if !feedbackRecipientId}
              <option value="" disabled>Select a recipient</option>
            {/if}
            {#each users as account (account.id)}
              <option value={account.id}>{account.full_name || account.email}</option>
            {/each}
          </select>
        </Field>
      </div>
      {#if feedbackRecipientError}
        <Banner tone="error" message={feedbackRecipientError} class="mt-2" />
      {/if}
      {#if feedbackRecipientSaved}
        <Banner tone="success" message="Feedback recipient updated." class="mt-2" />
      {/if}
    </div>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
      <Panel title="Team Accounts" id="user-access-accounts" loading={isRefreshing}>
        <DataTable
          columns={accountColumns}
          rows={users}
          rowKey="id"
          loading={isLoading}
          minWidth="54rem"
          emptyTitle="No team accounts yet"
          emptyMessage="Invite your first dashboard user to assign module access."
        >
          <svelte:fragment slot="cell" let:row let:column>
            {#if column.key === "person"}
              <p class="font-bold leading-snug text-ink">{row.full_name || row.email}</p>
              <p class="mt-1 break-words text-xs text-ink/55">{row.email}</p>
            {:else if column.key === "status"}
              <Badge tone={getAccountStatusTone(row)}>{getAccountStatusLabel(row)}</Badge>
              {#if row.invited_at}
                <p class="mt-1 text-xs text-ink/55">
                  Invited {formatShortDateTime(row.invited_at)}
                </p>
              {/if}
            {:else if column.key === "role"}
              <Badge tone={getRoleTone(row.role)}>{getRoleLabel(row.role)}</Badge>
            {:else if column.key === "access"}
              {#if row.role === ROLE_SUPERUSER}
                <span class="text-xs font-semibold text-ink/70">All modules</span>
              {:else}
                {@const accessModules = normalizeModules(row.modules || [])}
                {#if accessModules.length}
                  <div class="flex flex-wrap gap-1">
                    {#each accessModules as moduleKey}
                      <Badge tone="neutral" size="xs">{getModuleLabel(moduleKey)}</Badge>
                    {/each}
                  </div>
                {:else}
                  <span class="text-xs font-semibold text-ink/50">No access</span>
                {/if}
              {/if}
            {:else if column.key === "last_sign_in"}
              {formatShortDateTime(row.last_sign_in_at)}
            {:else if column.key === "actions"}
              <Button size="sm" icon={ShieldCheck} onclick={() => openUserDrawer(row)}>
                Manage
              </Button>
            {/if}
          </svelte:fragment>

          <svelte:fragment slot="card" let:row>
            <div class="rounded-card border border-ink/8 bg-white p-4 shadow-card">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-bold leading-snug text-ink">{row.full_name || row.email}</p>
                  <p class="mt-0.5 break-words text-xs text-ink/55">{row.email}</p>
                </div>
                <Badge tone={getAccountStatusTone(row)}>{getAccountStatusLabel(row)}</Badge>
              </div>
              <div class="mt-3">
                <Button size="sm" icon={ShieldCheck} onclick={() => openUserDrawer(row)}>
                  Manage
                </Button>
              </div>
            </div>
          </svelte:fragment>
        </DataTable>
      </Panel>

      <form
        class="rounded-card border border-ink/8 bg-canvas/60 p-4"
        onsubmit={inviteUser}
      >
        <div class="flex items-center gap-2">
          <MailPlus class="h-5 w-5 text-accent" aria-hidden="true" />
          <h4 class="font-bold text-ink">Invite New User</h4>
        </div>

        <Field label="Email" id="invite-email" required class="mt-4">
          <input
            id="invite-email"
            type="email"
            class="input"
            value={inviteForm.email}
            autocomplete="email"
            required
            oninput={(event) => updateInviteForm("email", event.currentTarget.value)}
          />
        </Field>

        <Field label="Full name" id="invite-full-name" class="mt-3">
          <input
            id="invite-full-name"
            type="text"
            class="input"
            value={inviteForm.full_name}
            autocomplete="name"
            oninput={(event) => updateInviteForm("full_name", event.currentTarget.value)}
          />
        </Field>

        <Field label="Role" id="invite-role" class="mt-3">
          <select
            id="invite-role"
            class="select"
            value={inviteForm.role}
            onchange={(event) => updateInviteForm("role", event.currentTarget.value)}
          >
            {#each roleOptions as role}
              <option value={role}>{getRoleLabel(role)}</option>
            {/each}
          </select>
        </Field>

        <div class="mt-3">
          <p class="text-sm font-semibold text-ink">Module access</p>
          <div class="mt-1.5">
            <AccessGrantsEditor
              grants={inviteModules}
              isSuperuser={inviteForm.role === ROLE_SUPERUSER}
              disabled={invitingUser}
              onChange={(next) => (inviteModules = next)}
            />
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          class="mt-4 w-full"
          icon={MailPlus}
          loading={invitingUser}
        >
          {invitingUser ? "Sending Invite" : "Send Invite"}
        </Button>
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
      {@const draft = selectedDraft}
      <div class="space-y-4 px-5 py-5">
        <div class="rounded-control border border-ink/8 bg-canvas/60 px-4 py-3 text-sm">
          <p class="font-bold text-ink">{selectedUser.email}</p>
          <p class="mt-1.5 flex flex-wrap items-center gap-2 text-ink/60">
            <Badge tone={getAccountStatusTone(selectedUser)} size="xs">
              {getAccountStatusLabel(selectedUser)}
            </Badge>
            <span>Last sign-in {formatShortDateTime(selectedUser.last_sign_in_at)}</span>
          </p>
        </div>

        <Field label="Full name" id={`access-name-${selectedUser.id}`}>
          <input
            id={`access-name-${selectedUser.id}`}
            type="text"
            class="input"
            value={draft.full_name}
            oninput={(event) => updateDraft(selectedUser.id, "full_name", event.currentTarget.value)}
          />
        </Field>

        <Field label="Role" id={`access-role-${selectedUser.id}`}>
          <select
            id={`access-role-${selectedUser.id}`}
            class="select"
            value={draft.role}
            disabled={selectedUser.id === profile?.id}
            title={selectedUser.id === profile?.id ? "You cannot remove your own superuser access." : undefined}
            onchange={(event) => updateDraft(selectedUser.id, "role", event.currentTarget.value)}
          >
            {#each roleOptions as role}
              <option value={role}>{getRoleLabel(role)}</option>
            {/each}
          </select>
        </Field>

        <div>
          <p class="text-sm font-semibold text-ink">Module access</p>
          <div class="mt-1.5">
            <AccessGrantsEditor
              grants={draft.modules}
              isSuperuser={draft.role === ROLE_SUPERUSER}
              disabled={Boolean(savingUserId)}
              onChange={(next) => updateDraft(selectedUser.id, "modules", next)}
            />
          </div>
        </div>
      </div>

      <div class="flex gap-2 border-t border-ink/8 p-4">
        <Button
          class="flex-1"
          onclick={requestCloseDrawer}
          disabled={Boolean(savingUserId)}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          class="flex-1"
          icon={Save}
          loading={savingUserId === selectedUser.id}
          disabled={!selectedDirty || savingUserId === selectedUser.id}
          onclick={saveSelectedUser}
        >
          {savingUserId === selectedUser.id ? "Saving" : "Save"}
        </Button>
      </div>
    {/if}
  </SlideOver>
{/if}
