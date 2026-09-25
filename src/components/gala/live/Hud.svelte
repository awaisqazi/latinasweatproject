<script>
  // ?debug=1 only. Never on screen during the show.
  import { money } from "../../../lib/galaLive/config.js";

  let { fx = {}, show = {}, feed = {}, state = {}, local = false, stale = false, keyMode = "public" } = $props();

  const age = $derived(feed.lastOkAt ? Math.round((Date.now() - feed.lastOkAt) / 100) / 10 : -1);
</script>

<div class="hud">
<pre>fx {fx.level} (req {fx.requested})  {fx.fps?.toFixed(0)} fps  {fx.ms?.toFixed(1)} ms  draws {fx.draws}  dpr {fx.pixelRatio?.toFixed(2)}
degrade {fx.degrade}  rebuilds {fx.rebuilds}  losses {fx.losses}  canvas {fx.canvas ? "up" : "down"}
mode {show.mode}  queue {show.queue}  inflight {show.inFlight}  drain {show.drain?.toFixed(1)}s  maxlag {(show.maxLagMs / 1000).toFixed(1)}s  hold {String(show.hold)}
true {money(show.trueCents)}  launched {money(show.launchedCents)}  landed {money(show.landedCents)}
stars {show.litBody}/{show.nBody}  halo {show.litHalo}/{show.nHalo}  core {String(show.coreLit)}  overflow {show.overflow}
feed {keyMode}  named {String(feed.named)}  live {String(feed.live)}  cursor {feed.cursor}  polls {feed.polls}  err {feed.errors} {feed.lastError}  age {age}s
scene {state.scene}  goal {money(state.goal_cents)}  fx_mode {state.fx_mode}  v{state.version}  poll {state.poll_ms}ms{local ? "  LOCAL" : ""}{stale ? "  STALE CLIENT" : ""}
keys 1-7 scene · space hold · c confetti · s supernova · f full · d hud · l fx · [ ] lift · shift+B boost · shift+C calib · shift+G safe · shift+Q qr</pre>
</div>

<style>
  .hud {
    position: fixed;
    left: 8px;
    bottom: 8px;
    z-index: 60;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.62);
    padding: 6px 9px;
    border: 1px solid rgba(255, 189, 89, 0.3);
  }
  pre {
    margin: 0;
    font: 12px/1.4 ui-monospace, Menlo, monospace;
    color: #9fb0c8;
    white-space: pre;
  }
</style>
