<!--
  Is this phone still talking to the desk next to it?

  Three states, never carried by colour alone: a dot, a word, and (once the
  socket is down) how long ago the list was last refreshed. Amber is not an
  error: polling keeps the list right, so the pill says so in words.
-->
<script>
  import { getContext } from "svelte";

  const { store } = getContext("gala-checkin");

  let now = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 5000);
    return () => clearInterval(t);
  });

  const status = $derived(store.sync.status);
  const ago = $derived.by(() => {
    const at = store.sync.lastSyncAt;
    if (!at) return "";
    const s = Math.max(0, Math.round((now - at) / 1000));
    if (s < 10) return "just now";
    if (s < 60) return `${s}s ago`;
    return `${Math.round(s / 60)}m ago`;
  });

  const WORD = { live: "Live", degraded: "Refreshing", offline: "Offline", loading: "Loading", locked: "Locked" };
</script>

<span class="sp sp--{status}" role="status" aria-live="polite">
  <span class="sp-dot" aria-hidden="true"></span>
  <span class="sp-word">{WORD[status] || status}</span>
  {#if status !== "live" && ago}
    <span class="sp-ago">{ago}</span>
  {/if}
</span>

<style>
  .sp {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    border: 1px solid currentColor;
    border-radius: 999px;
    font-family: var(--g26-sans);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .sp-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: currentColor;
  }
  .sp-ago {
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: none;
    opacity: 0.85;
  }

  .sp--live {
    color: var(--g26-ok);
  }
  .sp--degraded,
  .sp--loading {
    color: var(--g26-gold-soft);
  }
  .sp--offline,
  .sp--locked {
    color: var(--g26-alert);
  }

  /* The dot only pulses when it means "live", so motion is also a signal. */
  @media (prefers-reduced-motion: no-preference) {
    .sp--live .sp-dot {
      animation: sp-beat 2.4s ease-in-out infinite;
    }
  }
  @keyframes sp-beat {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
</style>
