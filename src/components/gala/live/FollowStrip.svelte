<script>
  // The persistent "follow along on your phone" strip on the projector. The QR
  // is rendered client side (qrcode, already bundled for the donate QR): no
  // network, no image file. Dark modules on a cream card, on an opaque plate
  // marked data-fx-quiet, so no glow or dust ever crosses the code.
  //
  // variant "corner": bottom right, program and calm scenes.
  // variant "top":    header row, right, for the appeal layout whose bottom
  //                   corners are already the donate QR and the roll call.
  import QRCode from "qrcode";
  import { FOLLOW_URL, FOLLOW_LABEL } from "../../../lib/galaLive/program.js";
  const AUCTION_LABEL = "latinasweatproject.com/lspgala";

  let { variant = "corner" } = $props();

  let dataUrl = $state("");
  $effect(() => {
    let alive = true;
    QRCode.toDataURL(FOLLOW_URL, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 480,
      color: { dark: "#05070C", light: "#FFF8EF" },
    })
      .then((d) => {
        if (alive) dataUrl = d;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  });
</script>

<div class="follow {variant}" data-fx-quiet data-follow-strip>
  <div class="txt">
    <div class="l1">Follow along on your phone</div>
    <div class="l2">at <b>{FOLLOW_LABEL}</b></div>
    <div class="l3">Silent auction all night · <b>{AUCTION_LABEL}</b></div>
  </div>
  <div class="qr">{#if dataUrl}<img src={dataUrl} alt="QR code for {FOLLOW_LABEL}" />{/if}</div>
</div>

<style>
  .follow {
    position: absolute;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 18);
    padding: calc(var(--u) * 10) calc(var(--u) * 10) calc(var(--u) * 10) calc(var(--u) * 22);
    background: rgba(5, 7, 12, 0.88);
    border: calc(var(--u) * 2) solid rgba(255, 189, 89, 0.35);
    border-radius: calc(var(--u) * 6);
  }
  .corner {
    right: calc(var(--u) * 96);
    bottom: calc(var(--u) * 54);
    height: calc(var(--u) * 132);
    width: calc(var(--u) * 640);
    justify-content: flex-end;
    box-sizing: border-box;
  }
  .top {
    right: calc(var(--u) * 96);
    top: calc(var(--u) * 16);
    height: calc(var(--u) * 100);
    padding: calc(var(--u) * 6) calc(var(--u) * 6) calc(var(--u) * 6) calc(var(--u) * 16);
  }
  .txt {
    text-align: right;
    line-height: 1.15;
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }
  .l1 {
    font-family: var(--g26-serif);
    font-style: italic;
    font-size: calc(var(--u) * 28);
    color: var(--g26-cream);
    white-space: nowrap;
  }
  .l2 {
    margin-top: calc(var(--u) * 2);
    font-weight: 700;
    font-size: calc(var(--u) * 21);
    letter-spacing: 0.02em;
    color: var(--g26-warm);
    white-space: nowrap;
  }
  .l2 b {
    color: var(--g26-gold);
    font-weight: 800;
  }
  .l3 {
    margin-top: calc(var(--u) * 6);
    padding-top: calc(var(--u) * 5);
    border-top: calc(var(--u) * 1) solid rgba(255, 189, 89, 0.28);
    font-weight: 600;
    font-size: calc(var(--u) * 15.5);
    line-height: 1.12;
    letter-spacing: 0.02em;
    color: var(--g26-warm);
    white-space: normal;
  }
  .l3 b {
    color: var(--g26-gold);
    font-weight: 800;
  }
  .top .l1 {
    font-size: calc(var(--u) * 24);
  }
  .top .l2 {
    font-size: calc(var(--u) * 17);
  }
  .top .l3 {
    margin-top: calc(var(--u) * 3);
    padding-top: calc(var(--u) * 3);
    font-size: calc(var(--u) * 14);
  }
  .qr {
    flex: 0 0 auto;
    height: 100%;
    aspect-ratio: 1;
    background: var(--g26-cream);
    border-radius: calc(var(--u) * 3);
    padding: calc(var(--u) * 4);
  }
  .qr img {
    display: block;
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
</style>
