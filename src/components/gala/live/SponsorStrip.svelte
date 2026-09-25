<script>
  // Sponsors come from state.config.sponsors: [{ name, logo_url }]. Default is
  // none. The 2025 logos in public/images/galalogos are NOT shown: this year's
  // list has to be set by the operator, so the screen can never thank a sponsor
  // who did not renew.
  import { COPY } from "../../../lib/galaLive/config.js";

  let { sponsors = [], max = 8 } = $props();
  const list = $derived(
    (Array.isArray(sponsors) ? sponsors : [])
      .filter((s) => s && typeof s === "object" && (s.name || s.logo_url))
      .slice(0, max),
  );
</script>

{#if list.length}
  <div class="sponsors">
    <div class="eyebrow">{COPY.sponsorsEyebrow}</div>
    <div class="row">
      {#each list as s (s.name || s.logo_url)}
        {#if s.logo_url}
          <div class="plaque"><img src={s.logo_url} alt={s.name || ""} loading="lazy" /></div>
        {:else}
          <div class="textname">{s.name}</div>
        {/if}
      {/each}
    </div>
  </div>
{/if}

<style>
  .sponsors {
    position: absolute;
    inset: 0;
    overflow: hidden;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: calc(var(--u) * 12);
  }
  .eyebrow {
    font-weight: 800;
    letter-spacing: 0.42em;
    text-transform: uppercase;
    font-size: calc(var(--u) * 24);
    color: var(--g26-gold);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: calc(var(--u) * 18);
    max-width: 100%;
  }
  /* Logos sit straight on the stage: no plate, border or ring. Use white
     knockout art (public/images/gala/2026/program/logos/white/). */
  .plaque {
    width: calc(var(--u) * 240);
    height: calc(var(--u) * 120);
  }
  .plaque img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    opacity: 0.92;
  }
  .textname {
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: calc(var(--u) * 52);
    color: var(--g26-cream);
    max-width: 100%;
    overflow-wrap: anywhere;
  }
</style>
