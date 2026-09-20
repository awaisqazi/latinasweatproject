<!--
  The desktop guest drawer: the cream stationery panel on the right, with the
  full guest record inside it.

  The record itself lives in GuestSheetBody so the phone can show the same thing
  full screen without a second copy drifting out of step.
-->
<script>
  import { getContext } from "svelte";
  import { ticketTypeById } from "../../lib/galaSeating/model.js";
  import Sheet from "./Sheet.svelte";
  import GuestSheetBody from "./GuestSheetBody.svelte";

  const { store, ui } = getContext("gala-seating");

  const plan = $derived(store.plan);
  const guest = $derived(ui.openGuestId ? plan.guests[ui.openGuestId] || null : null);
  const ticket = $derived(guest ? ticketTypeById(guest.ticketType) : null);
</script>

{#if guest}
  <Sheet eyebrow={ticket?.label || ""} title={guest.name} onclose={() => ui.closeSheets()}>
    {#snippet children()}
      <GuestSheetBody guestId={guest.id} />
    {/snippet}
  </Sheet>
{/if}
