<script>
  // The thank-you drawing. The pool is every approved fundraiser whose
  // eligible total reached the threshold; one winner is picked uniformly with
  // crypto.getRandomValues (see lib/dashboard/givingDraw.js) and the draw is
  // recorded insert-only in giving_draws with the frozen pool and the random
  // bytes. The winner is shown here and nowhere public.
  import { onDestroy, onMount } from "svelte";
  import { Dices } from "@lucide/svelte";
  import { isSuperuser } from "../../../lib/dashboard/roles";
  import Badge from "../ui/Badge.svelte";
  import Banner from "../ui/Banner.svelte";
  import Button from "../ui/Button.svelte";
  import ConfirmDialog from "../ui/ConfirmDialog.svelte";
  import EmptyState from "../ui/EmptyState.svelte";
  import Field from "../ui/Field.svelte";
  import Panel from "../ui/Panel.svelte";
  import { buildEligibleSnapshot, runDraw } from "../../../lib/dashboard/givingDraw";
  import {
    DRAW_COLUMNS,
    formatCents,
    formatChicagoDateTimeLabel,
    loadGivingDraws,
    loadGivingTotals,
  } from "../../../lib/dashboard/givingAdmin";

  export let supabase;
  export let profile = null;
  export let campaign;
  export let totals = [];
  export let draws = [];
  export let teamMembers = [];
  export let isTestCampaign = false;
  export let onChanged = async () => {};

  let now = Date.now();
  let clock;
  let confirming = false;
  let drawing = false;
  let drawError = "";
  let dialogError = "";
  let typedWord = "";
  let drawNote = "";
  let rehearsal = false;
  let rehearsalWord = "";
  let lastWinnerName = "";

  onMount(() => {
    clock = setInterval(() => (now = Date.now()), 30_000);
  });
  onDestroy(() => clearInterval(clock));

  $: endsAtMs = campaign?.ends_at ? new Date(campaign.ends_at).getTime() : Infinity;
  $: campaignEnded = now > endsAtMs;
  $: canRehearse = isTestCampaign && isSuperuser(profile);
  $: approvedTotals = totals
    .filter((row) => row.status === "approved")
    .slice()
    .sort((a, b) => Number(b.eligible_cents) - Number(a.eligible_cents) || a.display_name.localeCompare(b.display_name));
  $: inPool = approvedTotals.filter((row) => row.reached);
  $: notYet = approvedTotals.filter((row) => !row.reached && Number(row.raised_cents) > 0);
  $: isRedraw = draws.length > 0;
  $: drawAllowed = inPool.length > 0 && (campaignEnded || (canRehearse && rehearsal));
  $: membersById = Object.fromEntries(teamMembers.map((member) => [member.id, member]));

  function reasons(row) {
    const parts = [];
    if (Number(row.self_gift_cents) > 0) parts.push(`${formatCents(row.self_gift_cents)} own gift`);
    if (Number(row.flagged_cents) > 0) parts.push(`${formatCents(row.flagged_cents)} taken out by staff`);
    if (Number(row.late_cents) > 0) parts.push(`${formatCents(row.late_cents)} after the end`);
    return parts.join(" · ");
  }

  function memberName(id, members) {
    const member = members[id];
    return member?.full_name || member?.email || "A team member";
  }

  function winnerName(draw) {
    const pool = Array.isArray(draw.eligible) ? draw.eligible : [];
    return pool.find((row) => row.fundraiser_id === draw.winner_fundraiser_id)?.name || "Unknown";
  }

  function openConfirm() {
    drawError = "";
    dialogError = "";
    typedWord = "";
    drawNote = "";
    confirming = true;
  }

  async function confirmDraw() {
    if (drawing) return;
    dialogError = "";
    const note = drawNote.replace(/\s+/g, " ").trim();
    if (isRedraw) {
      if (typedWord.trim() !== "DRAW") {
        dialogError = "Type DRAW to run another drawing.";
        return;
      }
      if (!note) {
        dialogError = "Say why there is another drawing, for example the first winner declined.";
        return;
      }
    }
    if (!campaignEnded) {
      if (!(canRehearse && rehearsal && rehearsalWord.trim() === "REHEARSAL")) {
        dialogError = "The campaign has not ended yet.";
        return;
      }
    }

    drawing = true;
    // Fresh numbers and a fresh draw count, so the pool is the one on the
    // server right now and two people cannot draw over each other unseen.
    const [freshTotals, freshDraws] = await Promise.all([
      loadGivingTotals(supabase, campaign.slug),
      loadGivingDraws(supabase, campaign.slug),
    ]);
    if (freshTotals.error || freshDraws.error) {
      dialogError = (freshTotals.error || freshDraws.error).message;
      drawing = false;
      return;
    }
    if ((freshDraws.data || []).length !== draws.length) {
      drawing = false;
      confirming = false;
      drawError = "Someone else ran a drawing just now. Their result has been loaded; check it before drawing again.";
      await onChanged();
      return;
    }

    const snapshot = buildEligibleSnapshot(freshTotals.data || []);
    if (!snapshot.length) {
      dialogError = "Nobody has reached the threshold, so there is nobody to draw.";
      drawing = false;
      return;
    }

    let result;
    try {
      result = runDraw(snapshot, (array) => crypto.getRandomValues(array));
    } catch (error) {
      dialogError = error.message;
      drawing = false;
      return;
    }

    const noteParts = [];
    if (!campaignEnded) noteParts.push("Rehearsal before the campaign ended.");
    if (note) noteParts.push(note);

    const { data, error } = await supabase
      .from("giving_draws")
      .insert({
        campaign_slug: campaign.slug,
        drawn_by: profile?.id || null,
        eligible: result.eligible,
        seed: result.seed,
        winner_fundraiser_id: result.winner_fundraiser_id,
        note: noteParts.join(" ") || null,
      })
      .select(DRAW_COLUMNS)
      .maybeSingle();

    drawing = false;
    if (error || !data) {
      dialogError = error?.message || "The drawing could not be saved. Nothing was recorded.";
      return;
    }
    confirming = false;
    rehearsal = false;
    rehearsalWord = "";
    lastWinnerName = winnerName(data);
    await onChanged();
  }
</script>

<div class="space-y-4">
  {#if drawError}
    <Banner tone="warning" message={drawError} onDismiss={() => (drawError = "")} />
  {/if}
  {#if lastWinnerName}
    <Banner tone="success" message={`Drawn: ${lastWinnerName}. Recorded below. Staff only, do not post until they have been told.`} onDismiss={() => (lastWinnerName = "")} />
  {/if}

  <Panel title="Run the drawing" id="giving-draw-run-title">
    <p class="text-sm leading-6 text-ink/65">
      One winner is picked at random from the {inPool.length} fundraiser{inPool.length === 1 ? "" : "s"} who reached
      {formatCents(campaign.threshold_cents)} in eligible gifts. The pool and the random numbers are saved with the result.
      {#if campaignEnded}
        The campaign ended {formatChicagoDateTimeLabel(campaign.ends_at)}.
      {:else}
        It opens after the campaign ends, {formatChicagoDateTimeLabel(campaign.ends_at)} Chicago time.
      {/if}
    </p>

    {#if canRehearse && !campaignEnded}
      <div class="mt-4 rounded-control border border-amber-200 bg-amber-50/60 p-4">
        <label class="flex items-start gap-3 text-sm">
          <input type="checkbox" class="mt-0.5 h-4 w-4 rounded border-ink/20 text-accent focus:ring-accent" bind:checked={rehearsal} />
          <span>
            <span class="block font-semibold text-ink">Rehearsal on this test campaign</span>
            <span class="block text-xs text-ink/60">Superuser only. Runs before the end and is recorded as a rehearsal.</span>
          </span>
        </label>
        {#if rehearsal}
          <Field label="Type REHEARSAL to allow it" id="giving-rehearsal-word" class="mt-3">
            <input id="giving-rehearsal-word" class="input" autocomplete="off" bind:value={rehearsalWord} />
          </Field>
        {/if}
      </div>
    {/if}

    <div class="mt-4 flex flex-wrap items-center gap-3">
      <Button
        variant="primary"
        icon={Dices}
        disabled={!drawAllowed || (rehearsal && !campaignEnded && rehearsalWord.trim() !== "REHEARSAL")}
        onclick={openConfirm}
      >
        {isRedraw ? "Run another drawing" : "Run the drawing"}
      </Button>
      {#if !inPool.length}
        <span class="text-sm text-ink/55">Nobody has reached the threshold yet.</span>
      {/if}
    </div>
  </Panel>

  <div class="grid gap-4 xl:grid-cols-2">
    <Panel title={`In the drawing (${inPool.length})`} id="giving-draw-pool-title">
      {#if inPool.length}
        <div class="space-y-2">
          {#each inPool as row (row.fundraiser_id)}
            <div class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3">
              <span class="min-w-0 flex-1">
                <span class="block truncate font-bold leading-snug text-ink">{row.display_name}</span>
                {#if reasons(row)}
                  <span class="mt-0.5 block text-xs text-ink/55">Not counted: {reasons(row)}</span>
                {/if}
              </span>
              <span class="text-sm font-bold text-ink">{formatCents(row.eligible_cents)}</span>
            </div>
          {/each}
        </div>
      {:else}
        <EmptyState title="Nobody yet" message="Fundraisers join the pool when their eligible gifts reach the threshold." />
      {/if}
    </Panel>

    <Panel title={`Raised but not there yet (${notYet.length})`} id="giving-draw-notyet-title">
      {#if notYet.length}
        <div class="space-y-2">
          {#each notYet as row (row.fundraiser_id)}
            <div class="flex flex-wrap items-center gap-3 rounded-control border border-ink/8 bg-white px-4 py-3">
              <span class="min-w-0 flex-1">
                <span class="block truncate font-bold leading-snug text-ink">{row.display_name}</span>
                <span class="mt-0.5 block text-xs text-ink/55">
                  {formatCents(row.raised_cents)} raised{reasons(row) ? ` · not counted: ${reasons(row)}` : ""}
                </span>
              </span>
              <span class="text-sm font-bold text-ink">{formatCents(row.eligible_cents)}</span>
            </div>
          {/each}
        </div>
      {:else}
        <EmptyState title="Nobody here" message="Approved fundraisers with gifts below the threshold show here." />
      {/if}
    </Panel>
  </div>

  <Panel title="Past drawings" id="giving-draw-history-title">
    {#if draws.length}
      <div class="space-y-2">
        {#each draws as draw, index (draw.id)}
          <article class="rounded-control border border-ink/8 bg-white px-4 py-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-bold text-ink">{winnerName(draw)}</span>
              {#if index === 0}
                <Badge tone="gold" size="xs">Latest</Badge>
              {/if}
              <span class="text-xs font-semibold text-ink/55">
                {formatChicagoDateTimeLabel(draw.drawn_at)} · by {memberName(draw.drawn_by, membersById)} ·
                pool of {Array.isArray(draw.eligible) ? draw.eligible.length : 0}
              </span>
            </div>
            {#if draw.note}
              <p class="mt-1.5 text-sm text-ink/75">{draw.note}</p>
            {/if}
            <p class="mt-1.5 break-all font-mono text-[11px] text-ink/45">Random bytes: {draw.seed}</p>
          </article>
        {/each}
      </div>
      <p class="mt-3 text-xs text-ink/50">Drawings are permanent records and cannot be edited or deleted.</p>
    {:else}
      <EmptyState title="No drawing yet" message="The result is saved here the moment it is drawn." />
    {/if}
  </Panel>
</div>

<ConfirmDialog
  open={confirming}
  title={isRedraw ? "Run another drawing?" : "Run the drawing?"}
  confirmLabel={isRedraw ? "Draw again" : "Draw a winner"}
  tone="primary"
  busy={drawing}
  onConfirm={confirmDraw}
  onCancel={() => (confirming = false)}
>
  <p>
    One winner from {inPool.length} fundraiser{inPool.length === 1 ? "" : "s"}. The result is saved for good and cannot be undone.
  </p>
  {#if isRedraw}
    <p class="mt-2">A drawing already exists. Type DRAW and say why to run another.</p>
    <div class="mt-3 space-y-3">
      <Field label="Type DRAW" id="giving-redraw-word">
        <input id="giving-redraw-word" class="input" autocomplete="off" bind:value={typedWord} disabled={drawing} />
      </Field>
      <Field label="Why another drawing" id="giving-redraw-note" required>
        <input id="giving-redraw-note" class="input" maxlength="300" placeholder="For example: the first winner declined" bind:value={drawNote} disabled={drawing} />
      </Field>
    </div>
  {:else}
    <div class="mt-3">
      <Field label="Note" id="giving-draw-note" hint="Optional">
        <input id="giving-draw-note" class="input" maxlength="300" bind:value={drawNote} disabled={drawing} />
      </Field>
    </div>
  {/if}
  {#if dialogError}
    <p class="mt-3 text-xs font-medium text-red-700" role="alert">{dialogError}</p>
  {/if}
</ConfirmDialog>
