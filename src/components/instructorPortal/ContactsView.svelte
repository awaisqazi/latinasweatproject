<!--
  Who to contact. Emails are mailto: links, phones tel: links, each with a
  44 px tap target. An area with no way to reach anyone still shows its name
  and what it covers.
-->
<script>
  import Email from "./Email.svelte";
  import Inline from "./Inline.svelte";
  import { arr, str, mailHref, telHref } from "./text.js";

  let { content } = $props();

  const contacts = $derived(arr(content?.contacts).filter((c) => str(c.area) || str(c.who)));
  // A phones entry is a number string, or { label, number } when one row lists
  // several people. Entries without a dialable number are left out.
  function phoneList(list) {
    return arr(list)
      .map((p) => (typeof p === "string" ? { label: "", number: str(p) } : { label: str(p?.label), number: str(p?.number) }))
      .filter((p) => telHref(p.number));
  }
  const slug = (s, i) =>
    "contact-" +
    (str(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || String(i + 1));
</script>

<section class="ip-view" aria-labelledby="contacts">
  <h1 class="ip-h1" id="contacts" tabindex="-1">Who to contact</h1>
  <p class="ip-intro">Find the area, then email or call the person who handles it.</p>

  {#if contacts.length}
    <ul class="ip-contacts">
      {#each contacts as c, i}
        {@const emails = arr(c.emails).map(str).filter((e) => mailHref(e))}
        {@const phones = phoneList(c.phones)}
        <li class="ip-contact" id={slug(c.area, i)}>
          <h2>{str(c.area) || str(c.who)}</h2>
          {#if str(c.for)}<p class="ip-contact__for"><Inline text={c.for} /></p>{/if}
          {#if str(c.who) && str(c.area)}<p class="ip-contact__who"><Inline text={c.who} /></p>{/if}
          {#if emails.length || phones.length}
            <ul class="ip-reach">
              {#each emails as e}<li><a href={mailHref(e)}><Email address={e} /></a></li>{/each}
              {#each phones as p}<li><span class="ip-how">Call or text{#if p.label}&nbsp;{p.label}{/if}</span> <a class="is-tel" href={telHref(p.number)}>{p.number}</a></li>{/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="ip-muted" style="margin-top: 24px">The contact list isn't here yet. Ask the studio coordinator on shift.</p>
  {/if}
</section>
