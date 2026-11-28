<!--
  Get involved: volunteering (each item hides the day after `until`), the
  committee interest form, and fundraising and corporate partners.
-->
<script>
  import Email from "./Email.svelte";
  import Rich from "./Rich.svelte";
  import Inline from "./Inline.svelte";
  import { stillOpen } from "../../lib/instructorPortal/richText.js";
  import { arr, str, linkAttrs, mailHref } from "./text.js";

  let { content, today } = $props();

  const volunteer = $derived(stillOpen(content?.volunteer, today).filter((v) => str(v.title)));
  const committees = $derived(content?.committees && typeof content.committees === "object" ? content.committees : null);
  const committeesGo = $derived(linkAttrs(committees?.href));
  const fund = $derived(content?.fundraising && typeof content.fundraising === "object" ? content.fundraising : null);
  const fundLinks = $derived(arr(fund?.links).filter((l) => str(l.label) && linkAttrs(l.href)));
  const fundEmails = $derived(arr(fund?.contact?.emails).map(str).filter((e) => mailHref(e)));
  const hasCommittees = $derived(!!committees && (arr(committees.text).length > 0 || !!committeesGo));
  const hasFund = $derived(!!fund && (arr(fund.text).length > 0 || fundLinks.length > 0 || fundEmails.length > 0));
</script>

<section class="ip-view ip-involved" aria-labelledby="involved">
  <h1 class="ip-h1" id="involved" tabindex="-1">Get involved</h1>
  <p class="ip-intro">Ways to help beyond your classes.</p>

  <section class="ip-block" id="volunteer" aria-labelledby="volunteer-h">
    <h2 class="ip-h2" id="volunteer-h">Volunteer</h2>
    {#if volunteer.length}
      <ul class="ip-vol">
        {#each volunteer as v}
          {@const go = linkAttrs(v.href)}
          <li>
            <h3 class="ip-h3">{v.title}</h3>
            {#if str(v.when)}<p class="ip-vol__when">{v.when}</p>{/if}
            {#if str(v.text)}<p><Inline text={v.text} /></p>{/if}
            {#if go}<a class="ip-go" {...go}>{str(v.cta) || "Sign up"}</a>{/if}
          </li>
        {/each}
      </ul>
    {:else}
      <p class="ip-muted">No volunteer shifts are open right now.</p>
    {/if}
  </section>

  <div class="ip-invgrid">
    {#if hasCommittees}
      <section class="ip-block" id="committees" aria-labelledby="committees-h">
        <h2 class="ip-h2" id="committees-h">Join a committee</h2>
        <Rich blocks={committees.text} level={3} />
        {#if committeesGo}<a class="ip-btn" {...committeesGo}>{str(committees.cta) || "Open the committee form"}</a>{/if}
      </section>
    {/if}

    {#if hasFund}
      <section class="ip-block" id="fundraising" aria-labelledby="fundraising-h">
        <h2 class="ip-h2" id="fundraising-h">Fundraising and corporate partners</h2>
        <Rich blocks={fund.text} level={3} />
        {#if fundLinks.length}
          <ul class="ip-links" style="margin-top: 14px">
            {#each fundLinks as l}
              <li>
                <a class="ip-link" {...linkAttrs(l.href)}>{l.label}</a>
                {#if str(l.text)}<span><Inline text={l.text} /></span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if fundEmails.length}
          <div class="ip-ask">
            {#if str(fund.contact?.who)}<p>Questions: {fund.contact.who}</p>{/if}
            <ul class="ip-reach">
              {#each fundEmails as e}<li><a href={mailHref(e)}><Email address={e} /></a></li>{/each}
            </ul>
          </div>
        {/if}
      </section>
    {/if}
  </div>
</section>
