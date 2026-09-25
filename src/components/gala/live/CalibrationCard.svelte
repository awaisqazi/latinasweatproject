<script>
  // Shift+C at sound check. AV raises brightness until the sRGB 8 and 32
  // patches separate from 0, then `[` and `]` set the scene lift until the
  // ghost X reads from the back of the room (04 section 3.3, 05 section 4.6).
  const patches = [0, 8, 16, 24, 32, 48, 64, 96, 128];
  const ladder = [24, 30, 34, 56, 76, 96, 200];
</script>

<div class="calib">
  <div class="eyebrow">Calibration</div>
  <div class="ramp">
    {#each patches as v}
      <div class="patch" style={`background: rgb(${v},${v},${v})`}><span>{v}</span></div>
    {/each}
  </div>
  <div class="ramp">
    <div class="patch" style="background:#080B11"><span>bg top</span></div>
    <div class="patch" style="background:#121C2A"><span>bg mid</span></div>
    <div class="patch" style="background:#03050A"><span>bg bot</span></div>
    <div class="patch" style="background:#111A27"><span>navy</span></div>
    <div class="patch" style="background:#FFBD59"><span class="dark">gold</span></div>
    <div class="patch" style="background:#FFF8EF"><span class="dark">cream</span></div>
    <div class="patch" style="background:#C3CCD8"><span class="dark">muted floor</span></div>
  </div>
  <div class="ladder">
    {#each ladder as s}
      <div style={`font-size: calc(var(--u) * ${s})`}>{s}u Annual Gala $75,000</div>
    {/each}
  </div>
</div>

<style>
  .calib {
    position: absolute;
    left: calc(var(--u) * 96);
    top: calc(var(--u) * 96);
    right: calc(var(--u) * 96);
    bottom: calc(var(--u) * 96);
    background: rgba(5, 7, 12, 0.94);
    border: calc(var(--u) * 2) solid var(--g26-gold);
    padding: calc(var(--u) * 28);
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 18);
    z-index: 50;
  }
  .eyebrow {
    font-weight: 800;
    letter-spacing: 0.42em;
    text-transform: uppercase;
    font-size: calc(var(--u) * 26);
    color: var(--g26-gold);
  }
  .ramp {
    display: flex;
    gap: calc(var(--u) * 4);
    height: calc(var(--u) * 120);
  }
  .patch {
    flex: 1;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: calc(var(--u) * 6);
  }
  .patch span {
    font-size: calc(var(--u) * 20);
    font-weight: 800;
    color: #c3ccd8;
  }
  .patch span.dark {
    color: #05070c;
  }
  .ladder {
    display: flex;
    flex-direction: column;
    gap: calc(var(--u) * 6);
    color: var(--g26-cream);
    font-family: var(--g26-serif);
    font-style: italic;
    overflow: hidden;
  }
</style>
