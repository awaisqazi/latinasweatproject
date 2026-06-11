<script>
  export let variant = "block"; // block | text | circle
  let className = "";
  export { className as class };

  $: shape =
    variant === "circle"
      ? "rounded-full"
      : variant === "text"
        ? "h-4 rounded"
        : "rounded-md";
</script>

<div class="skeleton {shape} {className}" aria-hidden="true"></div>
