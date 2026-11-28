<!--
  "Copy link" for one answer or handbook section, so a coordinator can text
  someone straight to it. The link is the page address plus the anchor: it
  holds no content and no passcode.
-->
<script>
  let { id, label = "Copy link" } = $props();

  let done = $state("");
  let timer;

  async function copy() {
    const url = `${location.origin}${location.pathname}#${id}`;
    clearTimeout(timer);
    try {
      await navigator.clipboard.writeText(url);
      done = "Link copied";
    } catch {
      // No clipboard access (older browser, or not allowed): put the anchor in
      // the address bar instead, where it can be copied by hand.
      history.replaceState(history.state, "", `#${id}`);
      done = "The link is in the address bar";
    }
    timer = setTimeout(() => (done = ""), 2600);
  }
</script>

<button type="button" class="ip-textbtn" onclick={copy}>{done || label}</button>
<span class="ip-sr" aria-live="polite">{done}</span>
