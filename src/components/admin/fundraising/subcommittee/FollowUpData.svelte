<script context="module">
  // Survives leaving the Fundraising view, so coming back paints the last
  // Next up lines and thank-you counts at once while a fresh fetch runs.
  const cache = { attention: null, thanks: null };
</script>

<script>
  // Headless loader for the subcommittee tabs' follow-ups, mounted once by
  // FundraisingView: the Next up lines (fundraising_attention) and the
  // thank-you queue (fundraising_thanks_queue). Refetches on refreshKey, on
  // any change to thanks, updates or Zeffy payments (debounced), and when a
  // tab asks through the actions. Hands everything up as one `followUps`
  // object (bind:followUps). A missing RPC or no access leaves a status of
  // "missing" or "forbidden" and the tabs hide what depends on it.
  import { onDestroy, onMount } from "svelte";
  import { loadThanksQueue } from "../../../../lib/dashboard/fundraisingThanks";
  import { loadAttention, subscribeTables } from "../../../../lib/dashboard/fundraisingUpdates";

  export let supabase;
  export let refreshKey = 0;
  export let followUps = null;

  const DEBOUNCE_MS = 1500;

  // loading | ready | missing | forbidden | error
  let attentionStatus = cache.attention ? "ready" : "loading";
  let attention = cache.attention;
  let thanksStatus = cache.thanks ? "ready" : "loading";
  let thanks = cache.thanks;
  let thanksError = "";
  let attentionSeq = 0;
  let thanksSeq = 0;
  let timer = 0;
  let destroyed = false;
  let lastRefreshKey = refreshKey;
  let unsubscribe = () => {};

  const actions = {
    reloadAttention: () => fetchAttention(),
    reloadThanks: () => fetchThanks(),
    reloadAll: () => schedule(0),
  };

  $: followUps = {
    attention: { status: attentionStatus, data: attention },
    thanks: { status: thanksStatus, data: thanks, error: thanksError },
    actions,
  };

  $: if (refreshKey !== lastRefreshKey) {
    lastRefreshKey = refreshKey;
    schedule(0);
  }

  onMount(() => {
    fetchAttention();
    fetchThanks();
    unsubscribe = subscribeTables(
      supabase,
      ["fundraising_payment_thanks", "fundraising_updates", "zeffy_payments"],
      () => schedule(DEBOUNCE_MS),
    );
  });

  onDestroy(() => {
    destroyed = true;
    unsubscribe();
    if (typeof window !== "undefined") window.clearTimeout(timer);
  });

  function schedule(delay) {
    if (typeof window === "undefined") return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      fetchAttention();
      fetchThanks();
    }, delay);
  }

  function statusFor(result) {
    if (result.forbidden) return "forbidden";
    if (result.missing) return "missing";
    return "error";
  }

  async function fetchAttention() {
    if (!supabase || destroyed) return;
    const seq = ++attentionSeq;
    const result = await loadAttention(supabase);
    if (destroyed || seq !== attentionSeq) return;
    if (result.data) {
      attention = result.data;
      cache.attention = attention;
      attentionStatus = "ready";
    } else if (!attention || result.forbidden || result.missing) {
      // A failed refresh keeps the last good lines on screen.
      attention = null;
      cache.attention = null;
      attentionStatus = statusFor(result);
    }
  }

  async function fetchThanks() {
    if (!supabase || destroyed) return;
    const seq = ++thanksSeq;
    const result = await loadThanksQueue(supabase);
    if (destroyed || seq !== thanksSeq) return;
    if (result.data) {
      thanks = result.data;
      cache.thanks = thanks;
      thanksStatus = "ready";
      thanksError = "";
    } else if (!thanks || result.forbidden || result.missing) {
      thanks = null;
      cache.thanks = null;
      thanksStatus = statusFor(result);
      thanksError = result.error?.message || "";
    } else {
      thanksError = "The thank-you list could not be refreshed. Showing the last one loaded.";
    }
  }
</script>
