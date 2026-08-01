<script>
  // The staff list the kiosk authenticates against. Cards are assigned at the
  // iPad, not here — the portal's job is names, emails, PINs, classification,
  // and who is still employed.
  import { Download, IdCard, Plus, UserRoundX } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import SearchInput from "../ui/SearchInput.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import Tabs from "../ui/Tabs.svelte";
  import EmployeeDrawer from "./EmployeeDrawer.svelte";
  import { downloadCsv } from "../../../lib/dashboard/csv";
  import {
    PROFILE_ROLE_LABELS,
    ROSTER_CSV_HEADERS,
    employeeFullName,
    employeeLabel,
    isPendingRfid,
    rosterCsvFilename,
    rosterCsvRow,
  } from "../../../lib/dashboard/timeclock";

  export let supabase;
  export let employees = [];
  export let loading = false;
  export let onChanged = () => {};

  const STATUS_TABS = [
    { id: "active", label: "Active" },
    { id: "inactive", label: "Inactive" },
    { id: "all", label: "All" },
  ];

  let search = "";
  let statusFilter = "active";
  let errorMessage = "";
  let togglingId = "";

  let drawerOpen = false;
  let drawerEmployee = null;

  $: filtered = filterRoster(employees, search, statusFilter);

  function filterRoster(list, query, status) {
    const needle = query.trim().toLowerCase();

    return list
      .filter((employee) => {
        if (status === "active" && !employee.is_active) return false;
        if (status === "inactive" && employee.is_active) return false;
        if (!needle) return true;
        const haystack = [
          employeeFullName(employee),
          employee.email,
          employee.job_title,
          isPendingRfid(employee.rfid_tag) ? "" : employee.rfid_tag,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .slice()
      .sort((a, b) => employeeLabel(a).localeCompare(employeeLabel(b)));
  }

  $: activeCount = employees.filter((employee) => employee.is_active).length;
  $: inactiveCount = employees.length - activeCount;
  $: pendingCards = employees.filter(
    (employee) => employee.is_active && isPendingRfid(employee.rfid_tag),
  ).length;

  $: statusTabs = STATUS_TABS.map((tab) => ({
    ...tab,
    count:
      tab.id === "active"
        ? activeCount
        : tab.id === "inactive"
          ? inactiveCount
          : employees.length,
  }));

  function openCreate() {
    drawerEmployee = null;
    drawerOpen = true;
  }

  function openEdit(employee) {
    drawerEmployee = employee;
    drawerOpen = true;
  }

  async function toggleActive(employee) {
    if (togglingId) return;
    togglingId = employee.id;
    errorMessage = "";

    const { error } = await supabase
      .from("timeclock_employees")
      .update({ is_active: !employee.is_active })
      .eq("id", employee.id);

    togglingId = "";

    if (error) {
      errorMessage = error.message;
      return;
    }
    onChanged();
  }

  function exportCsv() {
    downloadCsv(
      rosterCsvFilename(),
      ROSTER_CSV_HEADERS,
      filtered.map((employee) => rosterCsvRow(employee)),
    );
  }

  function handleSaved() {
    drawerOpen = false;
    onChanged();
  }
</script>

<div class="space-y-4">
  {#if errorMessage}
    <Banner tone="error" message={errorMessage} onDismiss={() => (errorMessage = "")} />
  {/if}

  {#if pendingCards > 0}
    <Banner tone="info">
      {pendingCards} active {pendingCards === 1 ? "person is" : "people are"} waiting
      for an RFID card. They appear in the iPad's onboarding queue — tap their
      name there and scan a blank card to finish setting them up.
    </Banner>
  {/if}

  <Panel title="Roster" id="time-clock-roster-title">
    <div slot="actions" class="flex flex-wrap items-center gap-2">
      <Button size="sm" icon={Download} disabled={!filtered.length} onclick={exportCsv}>
        Export roster
      </Button>
      <Button size="sm" variant="primary" icon={Plus} onclick={openCreate}>
        Add employee
      </Button>
    </div>

    <div class="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <SearchInput
        bind:value={search}
        placeholder="Search name, email, job title, or card"
        label="Search the roster"
        class="lg:max-w-sm lg:flex-1"
      />
      <Tabs
        tabs={statusTabs}
        bind:active={statusFilter}
        variant="segmented"
        label="Roster status filter"
        hasPanels={false}
      />
    </div>

    {#if loading}
      <SkeletonCard lines={5} />
    {:else if !filtered.length}
      <EmptyState
        title={search.trim() ? "No matches" : "No one on the roster yet"}
        message={search.trim()
          ? "Try a different name, email, or job title."
          : "Add your instructors and coordinators here, then finish each one at the iPad by scanning their card."}
        icon={IdCard}
      >
        <div slot="actions">
          <Button variant="primary" size="sm" icon={Plus} onclick={openCreate}>
            Add employee
          </Button>
        </div>
      </EmptyState>
    {:else}
      <div class="thin-scroll overflow-x-auto">
        <table class="w-full text-left text-sm" style="min-width:900px">
          <thead>
            <tr class="border-b border-ink/10 bg-canvas/70">
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Name</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Email</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Job title</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Classification</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">PIN</th>
              <th scope="col" class="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Card</th>
              <th scope="col" class="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/65">Status</th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as employee (employee.id)}
              {@const needsCard = isPendingRfid(employee.rfid_tag)}
              <tr class="border-b border-ink/6 last:border-b-0 {employee.is_active ? '' : 'opacity-65'}">
                <td class="px-3 py-3 align-middle">
                  <button
                    type="button"
                    class="text-left font-semibold text-ink underline-offset-2 transition hover:text-accent-strong hover:underline"
                    onclick={() => openEdit(employee)}
                  >
                    {employeeLabel(employee)}
                  </button>
                </td>
                <td class="px-3 py-3 align-middle text-ink/70">{employee.email || "—"}</td>
                <td class="px-3 py-3 align-middle text-ink/70">{employee.job_title || "—"}</td>
                <td class="px-3 py-3 align-middle">
                  <Badge tone={employee.profile_role === "coordinator" ? "blue" : employee.profile_role === "both" ? "gold" : "teal"} size="xs">
                    {PROFILE_ROLE_LABELS[employee.profile_role] || "Instructor"}
                  </Badge>
                </td>
                <td class="px-3 py-3 align-middle">
                  {#if employee.pin}
                    <Badge tone="green" size="xs">Set</Badge>
                  {:else}
                    <span class="text-xs text-ink/40">None</span>
                  {/if}
                </td>
                <td class="px-3 py-3 align-middle">
                  {#if needsCard}
                    <Badge tone="amber" size="xs" dot>Needs card</Badge>
                  {:else}
                    <span class="font-mono text-xs text-ink/70">{employee.rfid_tag}</span>
                  {/if}
                </td>
                <td class="px-3 py-3 align-middle text-right">
                  <button
                    type="button"
                    class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors {employee.is_active ? 'bg-green-50 text-green-800' : 'bg-ink/[0.06] text-ink/60'}"
                    aria-pressed={employee.is_active}
                    disabled={togglingId === employee.id}
                    onclick={() => toggleActive(employee)}
                  >
                    <span
                      class="h-1.5 w-1.5 rounded-full {employee.is_active ? 'bg-green-600' : 'bg-ink/40'}"
                      aria-hidden="true"
                    ></span>
                    {employee.is_active ? "Active" : "Inactive"}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="mt-3 text-xs leading-5 text-ink/45">
        Deactivating stops someone clocking in at the iPad but keeps all of
        their history. Click a name to edit their details.
      </p>
    {/if}
  </Panel>

  <p class="flex items-center gap-2 px-1 text-xs text-ink/45">
    <UserRoundX class="h-3.5 w-3.5" aria-hidden="true" />
    Employees are never erased. Deleting one tombstones the record so the iPad
    can drop it on its next sync while payroll history stays intact.
  </p>
</div>

<EmployeeDrawer
  {supabase}
  {employees}
  open={drawerOpen}
  employee={drawerEmployee}
  onClose={() => (drawerOpen = false)}
  onSaved={handleSaved}
/>
