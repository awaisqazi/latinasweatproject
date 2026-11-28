<!--
  Who to ask while a policy or checklist is still being written.
  `skip`: text already on screen (the holding note). An email or phone number
  it already shows is not repeated; when nothing new is left, nothing renders.
-->
<script>
  import Email from "./Email.svelte";
  import { str, mailHref, telHref } from "./text.js";

  let { ask = null, skip = "" } = $props();

  const digits = (s) => String(s).replace(/\D/g, "");
  const who = $derived(str(ask?.who));
  const email = $derived(str(ask?.email));
  const phone = $derived(str(ask?.phone));
  const mail = $derived(email && !skip.toLowerCase().includes(email.toLowerCase()) ? mailHref(email) : null);
  const tel = $derived(phone && !(digits(phone).length >= 7 && digits(skip).includes(digits(phone))) ? telHref(phone) : null);
</script>

{#if mail || tel}
  <div class="ip-ask">
    {#if who}<p>Ask {who}:</p>{/if}
    <ul class="ip-reach">
      {#if mail}<li><a href={mail}><Email address={email} /></a></li>{/if}
      {#if tel}<li><span class="ip-how">Call or text</span> <a class="is-tel" href={tel}>{phone}</a></li>{/if}
    </ul>
  </div>
{/if}
