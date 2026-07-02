<script>
  // One donor's full picture: lifetime giving, gift history, and the team's
  // contact log so anyone can see the last touch before reaching out.
  import { CalendarClock, HandCoins, Mail, Phone, Send, UserPlus } from "@lucide/svelte";
  import SlideOver from "../marketing/SlideOver.svelte";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import {
    INTERACTION_KINDS,
    addInteraction,
    formatMoney,
    loadDonationsForEmail,
    loadInteractions,
  } from "../../../lib/dashboard/fundraising";

  export let supabase;
  export let donor = null;
  export let onClose = () => {};
  export let onAssignTask = () => {};

  let displayedDonor = null;
  let drawerOpen = false;
  let gifts = [];
  let giftsLoading = false;
  let interactions = [];
  let interactionsLoading = false;
  let errorMessage = "";
  let newInteractionKind = "note";
  let newInteractionBody = "";
  let loggingInteraction = false;

  $: if (donor?.email && donor.email !== displayedDonor?.email) {
    openDrawer(donor);
  } else if (!donor && drawerOpen) {
    drawerOpen = false;
  }
  $: donorTitle =
    displayedDonor?.donor_name || displayedDonor?.company_name || displayedDonor?.email || "";
  $: lastContact = interactions[0] || null;

  function openDrawer(nextDonor) {
    displayedDonor = nextDonor;
    errorMessage = "";
    newInteractionBody = "";
    drawerOpen = true;
    loadHistory(nextDonor.email);
  }

  // requestClose starts the slide-out; handleClose runs after the animation
  // so the drawer content doesn't vanish mid-slide.
  function requestClose() {
    drawerOpen = false;
  }

  function handleClose() {
    drawerOpen = false;
    displayedDonor = null;
    onClose();
  }

  async function loadHistory(email) {
    giftsLoading = true;
    interactionsLoading = true;
    gifts = [];
    interactions = [];

    const [giftsResult, logResult] = await Promise.all([
      loadDonationsForEmail(supabase, email),
      loadInteractions(supabase, { donorEmail: email }),
    ]);

    if (displayedDonor?.email !== email) return;

    if (giftsResult.error) {
      errorMessage = giftsResult.error.message;
    } else {
      gifts = giftsResult.data || [];
    }
    if (logResult.error) {
      errorMessage = errorMessage || logResult.error.message;
    } else {
      interactions = logResult.data || [];
    }

    giftsLoading = false;
    interactionsLoading = false;
  }

  async function logInteraction(event) {
    event?.preventDefault();

    const body = newInteractionBody.trim();
    if (!body || loggingInteraction || !displayedDonor?.email) return;

    loggingInteraction = true;
    errorMessage = "";

    const { data, error } = await addInteraction(supabase, {
      donorEmail: displayedDonor.email,
      kind: newInteractionKind,
      body,
    });

    if (error) {
      errorMessage = error.message;
    } else {
      interactions = [data, ...interactions];
      newInteractionBody = "";
    }

    loggingInteraction = false;
  }

  function formatDate(value) {
    if (!value) return "n/a";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  }

  function formatDateTime(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function giftNet(gift) {
    return Number(gift.total_amount || 0) - Number(gift.refund_amount || 0);
  }
</script>

<SlideOver
  open={drawerOpen}
  title={donorTitle}
  eyebrow="Donor"
  closeLabel="Close donor details"
  onClose={requestClose}
  onClosed={handleClose}
>
  {#if displayedDonor}
    <div class="px-5 py-5">
      <div class="flex flex-wrap gap-2">
        <Badge tone="gold">
          <HandCoins class="h-3.5 w-3.5" aria-hidden="true" />
          {formatMoney(displayedDonor.total_given || 0)} lifetime
        </Badge>
        <Badge tone="neutral">
          {displayedDonor.gift_count || 0} gift{(displayedDonor.gift_count || 0) === 1 ? "" : "s"}
        </Badge>
        <Badge tone="neutral">
          <CalendarClock class="h-3.5 w-3.5" aria-hidden="true" />
          Last gift {formatDate(displayedDonor.last_gift_date)}
        </Badge>
        {#if lastContact}
          <Badge tone="teal">Last contact {formatDateTime(lastContact.occurred_at)}</Badge>
        {/if}
      </div>

      <div class="mt-4 space-y-1.5 text-sm text-ink/75">
        <p class="flex items-center gap-2">
          <Mail class="h-4 w-4 shrink-0 text-ink/40" aria-hidden="true" />
          <a class="truncate font-semibold text-accent-strong hover:underline" href={`mailto:${displayedDonor.email}`}>
            {displayedDonor.email}
          </a>
        </p>
        {#if displayedDonor.phone}
          <p class="flex items-center gap-2">
            <Phone class="h-4 w-4 shrink-0 text-ink/40" aria-hidden="true" />
            <a class="font-semibold text-accent-strong hover:underline" href={`tel:${displayedDonor.phone}`}>
              {displayedDonor.phone}
            </a>
          </p>
        {/if}
        {#if displayedDonor.company_name}
          <p class="text-ink/60">Company: {displayedDonor.company_name}</p>
        {/if}
      </div>

      <div class="mt-4">
        <Button
          size="sm"
          icon={UserPlus}
          onclick={() =>
            onAssignTask({
              sourceModule: "fundraising",
              sourceLabel: `Donor: ${donorTitle}`,
              sourceLink: "#fundraising",
              title: `Follow up with ${donorTitle}`,
            })}
        >
          Assign a task about this donor
        </Button>
      </div>

      {#if errorMessage}
        <Banner tone="error" message={errorMessage} class="mt-4" />
      {/if}

      <section class="mt-5 rounded-control border border-ink/8 bg-white p-4" aria-labelledby="donor-log-title">
        <h4 id="donor-log-title" class="font-bold text-ink">Contact log</h4>

        <form class="mt-3 space-y-2" onsubmit={logInteraction}>
          <div class="grid grid-cols-[auto_1fr] gap-2">
            <select class="select" aria-label="Interaction type" bind:value={newInteractionKind} disabled={loggingInteraction}>
              {#each INTERACTION_KINDS as kind}
                <option value={kind.value}>{kind.label}</option>
              {/each}
            </select>
            <Button
              variant="primary"
              type="submit"
              icon={Send}
              class="justify-self-end"
              loading={loggingInteraction}
              disabled={!newInteractionBody.trim()}
            >
              Log it
            </Button>
          </div>
          <textarea
            class="textarea"
            rows="2"
            placeholder="e.g. Thanked her at the gala; interested in monthly giving."
            aria-label="Interaction details"
            bind:value={newInteractionBody}
            disabled={loggingInteraction}
          ></textarea>
        </form>

        <div class="mt-4 space-y-3">
          {#if interactionsLoading}
            <p class="text-sm text-ink/55">Loading contact history…</p>
          {:else if interactions.length}
            {#each interactions as entry (entry.id)}
              <article class="rounded-control border border-ink/8 bg-canvas/50 px-3 py-2.5">
                <div class="flex flex-wrap items-center gap-2 text-xs font-semibold text-ink/55">
                  <Badge tone="neutral" size="xs">{entry.kind}</Badge>
                  <span>{entry.author_name || "Team member"}</span>
                  <span>·</span>
                  <span>{formatDateTime(entry.occurred_at)}</span>
                </div>
                <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/80">{entry.body}</p>
              </article>
            {/each}
          {:else}
            <p class="rounded-control border border-dashed border-ink/15 bg-white px-3 py-4 text-center text-sm text-ink/55">
              No contact logged yet. Log calls, emails, and event conversations so
              the next person knows where things stand.
            </p>
          {/if}
        </div>
      </section>

      <section class="mt-5 rounded-control border border-ink/8 bg-white p-4" aria-labelledby="donor-gifts-title">
        <h4 id="donor-gifts-title" class="font-bold text-ink">Gift history</h4>
        <div class="mt-3 space-y-2">
          {#if giftsLoading}
            <p class="text-sm text-ink/55">Loading gifts…</p>
          {:else if gifts.length}
            {#each gifts as gift (gift.id)}
              <article class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-canvas/40 px-3 py-2.5">
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-bold leading-snug text-ink">
                    {gift.campaign_title || "(no campaign)"}
                  </span>
                  <span class="mt-0.5 block text-xs font-semibold text-ink/50">
                    {formatDate(gift.payment_date)}
                    {#if gift.rate_title}
                      · {gift.rate_title}
                    {/if}
                    {#if gift.payment_status && gift.payment_status !== "Succeeded"}
                      · {gift.payment_status}
                    {/if}
                    {#if Number(gift.refund_amount) > 0}
                      · refunded {formatMoney(gift.refund_amount)}
                    {/if}
                  </span>
                  {#if gift.note}
                    <span class="mt-1 block text-xs leading-5 text-ink/60">“{gift.note}”</span>
                  {/if}
                  {#if gift.in_honor_of}
                    <span class="mt-1 block text-xs leading-5 text-ink/60">In honor of {gift.in_honor_of}</span>
                  {/if}
                </span>
                <span class="text-sm font-bold {giftNet(gift) > 0 ? 'text-ink' : 'text-ink/45'}">
                  {giftNet(gift) > 0 ? formatMoney(giftNet(gift)) : "Free"}
                </span>
              </article>
            {/each}
          {:else}
            <p class="text-sm text-ink/55">No recorded gifts for this email.</p>
          {/if}
        </div>
      </section>

      <div class="mt-5 border-t border-ink/8 pt-4">
        <Button variant="secondary" class="w-full" onclick={requestClose}>Close</Button>
      </div>
    </div>
  {/if}
</SlideOver>
