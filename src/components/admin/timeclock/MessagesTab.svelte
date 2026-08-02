<script>
  // The announcements the kiosk shows during check-in. Each one can be aimed
  // at everybody, at a shift role, or at one person, and can be windowed to a
  // date range. The kiosk writes a receipt whenever a message was on screen as
  // someone confirmed a punch, so authors can see who has actually read it.
  import { onMount } from "svelte";
  import { Archive, ChevronDown, ChevronRight, Megaphone, Plus } from "@lucide/svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Panel from "../ui/Panel.svelte";
  import SkeletonCard from "../ui/SkeletonCard.svelte";
  import KioskMessagePreview from "./KioskMessagePreview.svelte";
  import MessageDrawer from "./MessageDrawer.svelte";
  import {
    AUDIENCE_LABELS,
    MESSAGE_COLUMNS,
    RECEIPT_COLUMNS,
    employeeLabel,
    formatChicagoDateTimeLabel,
    formatDateOnlyLabel,
  } from "../../../lib/dashboard/timeclock";

  export let supabase;
  export let profile = null;
  // Full roster: receipts can point at someone who has since been
  // deactivated, and their name should still resolve.
  export let employees = [];
  export let refreshKey = 0;
  export let onChanged = () => {};

  let messages = [];
  let receipts = [];
  let isLoading = true;
  let errorMessage = "";
  let lastRefreshKey = refreshKey;

  // Receipts are cheap rows and the kiosk keeps pushing them for months, so
  // ask for far more than the handful of messages could plausibly need.
  const RECEIPT_LIMIT = 20000;

  let expandedId = "";
  let togglingId = "";
  let archiveTarget = null;
  let isArchiving = false;

  let drawerOpen = false;
  let drawerMessage = null;

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    loadAll();
  }

  onMount(loadAll);

  async function loadAll() {
    if (!supabase) return;
    isLoading = true;
    errorMessage = "";

    // Messages first, then only their receipts. Fetching the newest receipts
    // globally instead would let one chatty announcement's rows fill the whole
    // page and silently zero out every older message's count.
    const messagesRes = await supabase
      .from("timeclock_messages")
      .select(MESSAGE_COLUMNS)
      .order("is_active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (messagesRes.error) {
      errorMessage = messagesRes.error.message;
      isLoading = false;
      return;
    }

    messages = messagesRes.data || [];
    const ids = messages.map((message) => message.id);

    if (!ids.length) {
      receipts = [];
      isLoading = false;
      return;
    }

    const receiptsRes = await supabase
      .from("timeclock_message_receipts")
      .select(RECEIPT_COLUMNS)
      .in("message_id", ids)
      .order("seen_at", { ascending: false })
      .limit(RECEIPT_LIMIT);

    if (receiptsRes.error) errorMessage = receiptsRes.error.message;
    else receipts = receiptsRes.data || [];

    isLoading = false;
  }

  $: employeeById = Object.fromEntries(
    employees.map((employee) => [employee.id, employee]),
  );

  // receipts arrive newest-first, so the first hit per employee is their
  // latest view of that message.
  $: receiptsByMessage = buildReceipts(receipts);

  function buildReceipts(list) {
    const map = {};
    for (const receipt of list) {
      if (!map[receipt.message_id]) {
        map[receipt.message_id] = {
          total: 0,
          latestByEmployee: new Map(),
          ackByEmployee: new Map(),
        };
      }
      const bucket = map[receipt.message_id];
      bucket.total += 1;
      if (!bucket.latestByEmployee.has(receipt.employee_id)) {
        bucket.latestByEmployee.set(receipt.employee_id, receipt);
      }
      // A person can rack up several receipts for the same message; they
      // count as acknowledged the moment any one of those rows was
      // explicitly confirmed, and we surface the latest such confirmation.
      if (receipt.acknowledged_at) {
        const ackMs = new Date(receipt.acknowledged_at).getTime();
        const existing = bucket.ackByEmployee.get(receipt.employee_id);
        if (!existing || ackMs > existing.ackMs) {
          bucket.ackByEmployee.set(receipt.employee_id, {
            acknowledgedAt: receipt.acknowledged_at,
            ackMs,
          });
        }
      }
    }
    return map;
  }

  $: rows = messages.map((message) => {
    const bucket = receiptsByMessage[message.id];
    const viewers = bucket ? Array.from(bucket.latestByEmployee.values()) : [];
    const ackByEmployee = bucket?.ackByEmployee || new Map();
    return {
      message,
      total: bucket?.total || 0,
      people: viewers.length,
      acknowledgedCount: ackByEmployee.size,
      viewers: viewers
        .map((receipt) => {
          const ack = ackByEmployee.get(receipt.employee_id);
          return {
            id: receipt.id,
            employeeId: receipt.employee_id,
            name: employeeById[receipt.employee_id]
              ? employeeLabel(employeeById[receipt.employee_id])
              : "Former employee",
            seen: formatChicagoDateTimeLabel(receipt.seen_at),
            seenMs: new Date(receipt.seen_at).getTime(),
            acknowledged: Boolean(ack),
            acknowledgedAt: ack ? formatChicagoDateTimeLabel(ack.acknowledgedAt) : "",
          };
        })
        .sort((a, b) => b.seenMs - a.seenMs),
      audienceLabel: audienceLabelFor(message),
      window: windowLabel(message),
    };
  });

  $: activeCount = messages.filter((message) => message.is_active).length;

  function audienceLabelFor(message) {
    if (message.employee_id) {
      const employee = employeeById[message.employee_id];
      return employee ? employeeLabel(employee) : "One person";
    }
    return AUDIENCE_LABELS[message.audience] || "Everyone";
  }

  function windowLabel(message) {
    if (!message.starts_on && !message.ends_on) return "Always showing";
    if (message.starts_on && message.ends_on) {
      return `${formatDateOnlyLabel(message.starts_on)} – ${formatDateOnlyLabel(message.ends_on)}`;
    }
    if (message.starts_on) return `From ${formatDateOnlyLabel(message.starts_on)}`;
    return `Until ${formatDateOnlyLabel(message.ends_on)}`;
  }

  async function toggleActive(message) {
    if (togglingId) return;
    togglingId = message.id;
    errorMessage = "";

    const { error } = await supabase
      .from("timeclock_messages")
      .update({ is_active: !message.is_active })
      .eq("id", message.id);

    togglingId = "";

    if (error) {
      errorMessage = error.message;
      return;
    }
    await loadAll();
    onChanged();
  }

  async function confirmArchive() {
    if (!archiveTarget || isArchiving) return;
    isArchiving = true;
    errorMessage = "";

    // Archive, never delete. The kiosk queues read-receipts while it is
    // offline and pushes them whenever it next reconnects; a receipt whose
    // message row is gone is rejected forever, and the iPad retries that same
    // push on every sync. Turning the message off costs nothing and keeps the
    // record of who saw it.
    const { error } = await supabase
      .from("timeclock_messages")
      .update({ is_active: false })
      .eq("id", archiveTarget.id);

    isArchiving = false;
    archiveTarget = null;

    if (error) {
      errorMessage = error.message;
      return;
    }
    await loadAll();
    onChanged();
  }

  function openCreate() {
    drawerMessage = null;
    drawerOpen = true;
  }

  function openEdit(message) {
    drawerMessage = message;
    drawerOpen = true;
  }

  async function handleSaved() {
    drawerOpen = false;
    await loadAll();
    onChanged();
  }

  function toggleExpanded(id) {
    expandedId = expandedId === id ? "" : id;
  }
</script>

<div class="space-y-4">
  {#if errorMessage}
    <Banner tone="error" message={errorMessage} onRetry={loadAll} />
  {/if}

  <Panel title="Check-in messages" id="time-clock-messages-title">
    <div slot="actions">
      <Button size="sm" variant="primary" icon={Plus} onclick={openCreate}>
        New message
      </Button>
    </div>

    <p class="text-sm leading-6 text-ink/60">
      These appear on the studio iPad the moment someone taps in. Active
      messages show in sort order; a message with a date window only shows
      inside it. {activeCount} of {messages.length} are active — archived ones
      stay here with the record of who saw them.
    </p>

    {#if isLoading}
      <div class="mt-4">
        <SkeletonCard lines={4} />
      </div>
    {:else if !messages.length}
      <div class="mt-4">
        <EmptyState
          title="No messages yet"
          message="Post a reminder about the new towel policy, a schedule change, or a shout-out. Staff see it as they clock in."
          icon={Megaphone}
        >
          <div slot="actions">
            <Button variant="primary" size="sm" icon={Plus} onclick={openCreate}>
              Write the first one
            </Button>
          </div>
        </EmptyState>
      </div>
    {:else}
      <div class="mt-4 space-y-2">
        {#each rows as row, index (row.message.id)}
          {@const expanded = expandedId === row.message.id}
          <!-- rows arrive active-first, so this draws exactly two headings. -->
          {#if index === 0 && row.message.is_active}
            <p class="pt-1 text-xs font-bold uppercase tracking-[0.12em] text-ink/45">
              Showing on the iPad
            </p>
          {/if}
          {#if !row.message.is_active && (index === 0 || rows[index - 1].message.is_active)}
            <p class="pt-3 text-xs font-bold uppercase tracking-[0.12em] text-ink/45">
              Archived · not showing
            </p>
          {/if}
          <div class="rounded-control border bg-white {row.message.is_active ? 'border-ink/8' : 'border-dashed border-ink/15 bg-canvas/50 opacity-75'}">
            <div class="flex flex-wrap items-start gap-3 px-4 py-3">
              <span class="min-w-0 flex-1">
                <button
                  type="button"
                  class="block max-w-full truncate text-left font-bold leading-snug text-ink underline-offset-2 transition hover:text-accent-strong hover:underline"
                  onclick={() => openEdit(row.message)}
                >
                  {row.message.title || "Untitled message"}
                </button>
                <span class="mt-1 flex flex-wrap items-center gap-1.5">
                  {#if !row.message.is_active}
                    <Badge tone="neutral" size="xs">Archived</Badge>
                  {/if}
                  <Badge
                    tone={row.message.employee_id ? "gold" : row.message.audience === "all" ? "neutral" : "teal"}
                    size="xs"
                  >
                    {row.audienceLabel}
                  </Badge>
                  <span class="text-xs font-semibold text-ink/50">{row.window}</span>
                  <span class="text-xs text-ink/40">· order {row.message.sort_order ?? 0}</span>
                </span>
                <span class="mt-1.5 block line-clamp-2 text-sm leading-6 text-ink/65">
                  {row.message.body}
                </span>
              </span>

              <span class="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold transition-colors {row.message.is_active ? 'bg-green-50 text-green-800' : 'bg-ink/[0.06] text-ink/60'}"
                  aria-pressed={row.message.is_active}
                  disabled={togglingId === row.message.id}
                  onclick={() => toggleActive(row.message)}
                >
                  <span
                    class="h-1.5 w-1.5 rounded-full {row.message.is_active ? 'bg-green-600' : 'bg-ink/40'}"
                    aria-hidden="true"
                  ></span>
                  <!-- One state, one word: "off" and "archived" are the same
                       thing now, and this button is how you undo it. -->
                  {row.message.is_active ? "Active" : "Archived"}
                </button>
                {#if row.message.is_active}
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    icon={Archive}
                    label={`Archive ${row.message.title || "message"}`}
                    onclick={() => (archiveTarget = row.message)}
                  />
                {/if}
              </span>
            </div>

            <div class="border-t border-ink/6 px-4 py-2">
              <button
                type="button"
                class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink/60 transition hover:text-ink"
                aria-expanded={expanded}
                onclick={() => toggleExpanded(row.message.id)}
              >
                <svelte:component
                  this={expanded ? ChevronDown : ChevronRight}
                  class="h-3.5 w-3.5"
                  aria-hidden="true"
                />
                {#if row.people}
                  Seen by {row.people} · acknowledged by {row.acknowledgedCount}
                {:else}
                  Not seen yet
                {/if}
              </button>

              {#if expanded}
                {#if row.viewers.length}
                  <ul class="mt-2 space-y-1 pb-1">
                    {#each row.viewers as viewer (viewer.employeeId)}
                      <li class="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span class="font-semibold text-ink/80">{viewer.name}</span>
                        <span class="flex items-center gap-2">
                          <span class="text-ink/50">{viewer.seen}</span>
                          {#if viewer.acknowledged}
                            <Badge tone="green" size="xs">Confirmed {viewer.acknowledgedAt}</Badge>
                          {:else}
                            <Badge tone="neutral" size="xs">Not confirmed</Badge>
                          {/if}
                        </span>
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <p class="mt-2 pb-1 text-xs text-ink/50">
                    No one has checked in while this message was on screen.
                  </p>
                {/if}
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Panel>

  {#if rows.length}
    <Panel title="On the iPad" id="time-clock-preview-title">
      <p class="mb-3 text-sm leading-6 text-ink/60">
        The first active message, as staff see it during check-in.
      </p>
      {#if rows.find((row) => row.message.is_active)}
        {@const first = rows.find((row) => row.message.is_active)}
        <KioskMessagePreview
          title={first.message.title}
          body={first.message.body}
          audience={first.message.audience}
          personName={first.message.employee_id ? first.audienceLabel : ""}
        />
      {:else}
        <EmptyState
          title="Nothing is active"
          message="Turn a message on to have it show up at the studio."
          icon={Megaphone}
        />
      {/if}
    </Panel>
  {/if}
</div>

<MessageDrawer
  {supabase}
  {profile}
  {employees}
  open={drawerOpen}
  message={drawerMessage}
  nextSortOrder={messages.length}
  onClose={() => (drawerOpen = false)}
  onSaved={handleSaved}
/>

<ConfirmDialog
  open={Boolean(archiveTarget)}
  title="Archive this message?"
  message={`"${archiveTarget?.title || "Untitled message"}" stops showing on the iPad at its next sync. It stays in this list under Archived, with the record of who saw it, and you can switch it back on any time. Messages are never deleted outright: the iPad may still be holding read-receipts it has not managed to send yet, and those receipts can never be delivered if the message they point at is gone.`}
  confirmLabel="Archive message"
  tone="danger"
  busy={isArchiving}
  onConfirm={confirmArchive}
  onCancel={() => (archiveTarget = null)}
/>
