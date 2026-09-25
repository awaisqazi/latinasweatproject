<script>
  // The donate QR, rendered client side from state.config.donate_url so the
  // operator can change it without a deploy. No image file, nothing to 404 at
  // the venue. Cream card with a gilt edge (04 section 2.4).
  import QRCode from "qrcode";
  import { COPY } from "../../../lib/galaLive/config.js";

  let { url = "", short = "", spotlight = false, compact = false, label = COPY.giveNow } = $props();

  let dataUrl = $state("");
  let failed = $state(false);

  const pretty = $derived(
    short || String(url).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, ""),
  );
  const urlSize = $derived(pretty.length > 46 ? 24 : pretty.length > 34 ? 28 : 31);

  $effect(() => {
    const target = String(url || "").trim();
    if (!target) {
      dataUrl = "";
      return;
    }
    let alive = true;
    QRCode.toDataURL(target, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 720,
      color: { dark: "#05070C", light: "#FFF8EF" },
    })
      .then((d) => {
        if (alive) {
          dataUrl = d;
          failed = false;
        }
      })
      .catch(() => {
        if (alive) failed = true;
      });
    return () => {
      alive = false;
    };
  });
</script>

<div class="qr" class:spotlight class:compact>
  {#if dataUrl}
    <div class="card"><img src={dataUrl} alt="" /></div>
  {:else if failed}
    <div class="card empty"></div>
  {:else}
    <div class="card empty"></div>
  {/if}
  <div class="side">
    <div class="label">{label}</div>
    <div class="url" style={`font-size: calc(var(--u) * ${spotlight ? 52 : urlSize})`}>{pretty}</div>
  </div>
</div>

<style>
  .qr {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 28);
    overflow: hidden;
  }
  .card {
    flex: 0 0 auto;
    width: calc(var(--u) * 168);
    height: calc(var(--u) * 168);
    padding: calc(var(--u) * 10);
    background: var(--g26-cream);
    border-radius: calc(var(--u) * 6);
    box-shadow:
      0 0 0 calc(var(--u) * 1) #e4c98a,
      0 0 0 calc(var(--u) * 5) #fff8ef,
      0 0 0 calc(var(--u) * 6) rgb(185 132 47 / 0.55),
      var(--g26-glow-md);
  }
  .card.empty {
    background: rgba(255, 248, 239, 0.14);
    box-shadow: none;
  }
  .card img {
    width: 100%;
    height: 100%;
    display: block;
    image-rendering: pixelated;
  }
  .side {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }
  .label {
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: calc(var(--u) * 76);
    line-height: 1.02;
    color: var(--g26-cream);
  }
  .url {
    font-weight: 800;
    letter-spacing: 0.02em;
    color: var(--g26-gold);
    overflow-wrap: anywhere;
    line-height: 1.2;
    margin-top: calc(var(--u) * 6);
  }
  /* Calm scenes give the QR a shorter band. */
  .compact .card {
    width: calc(var(--u) * 108);
    height: calc(var(--u) * 108);
    padding: calc(var(--u) * 7);
  }
  .compact .label {
    font-size: calc(var(--u) * 52);
  }
  /* QR spotlight (04 section 3.3): the code carries to the back tables. */
  .spotlight .card {
    width: calc(var(--u) * 480);
    height: calc(var(--u) * 480);
  }
  .spotlight .label {
    font-size: calc(var(--u) * 110);
  }
</style>
