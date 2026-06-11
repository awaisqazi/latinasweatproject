<script>
  // Portal button. Gold is a surface here, so primary text is always ink.
  export let variant = "secondary"; // primary | dark | secondary | ghost | danger
  export let size = "md"; // sm | md
  export let type = "button";
  export let href = "";
  export let disabled = false;
  export let loading = false;
  export let icon = null; // lucide component
  export let iconOnly = false;
  export let label = ""; // required aria-label when iconOnly
  export let title = "";
  export let onclick = () => {};
  let className = "";
  export { className as class };

  const VARIANTS = {
    primary:
      "bg-brand text-ink hover:bg-brand-strong border border-transparent shadow-card",
    dark: "bg-ink text-white hover:bg-black border border-transparent shadow-card",
    secondary:
      "bg-white text-ink border border-ink/14 hover:border-ink/30 hover:bg-ink/[0.03] shadow-card",
    ghost: "bg-transparent text-ink/70 border border-transparent hover:bg-ink/[0.06] hover:text-ink",
    danger:
      "bg-white text-red-700 border border-red-200 hover:border-red-400 hover:bg-red-50 shadow-card",
  };

  $: sizeClass = iconOnly
    ? size === "sm"
      ? "h-9 w-9"
      : "h-10 w-10"
    : size === "sm"
      ? "min-h-9 px-3 text-sm gap-1.5"
      : "min-h-10 px-4 text-sm gap-2";

  $: classes = `inline-flex items-center justify-center rounded-control font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-55 ${VARIANTS[variant] || VARIANTS.secondary} ${sizeClass} ${className}`;

  $: spinnerClass = `h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent`;
</script>

{#if href && !disabled}
  <a {href} class={classes} aria-label={iconOnly ? label : undefined} title={title || (iconOnly ? label : undefined)}>
    {#if loading}
      <span class={spinnerClass} aria-hidden="true"></span>
    {:else if icon}
      <svelte:component this={icon} class="h-4 w-4 shrink-0" aria-hidden="true" />
    {/if}
    {#if !iconOnly}<slot />{/if}
  </a>
{:else}
  <button
    {type}
    class={classes}
    disabled={disabled || loading}
    aria-label={iconOnly ? label : undefined}
    title={title || (iconOnly ? label : undefined)}
    aria-busy={loading || undefined}
    {onclick}
  >
    {#if loading}
      <span class={spinnerClass} aria-hidden="true"></span>
    {:else if icon}
      <svelte:component this={icon} class="h-4 w-4 shrink-0" aria-hidden="true" />
    {/if}
    {#if !iconOnly}<slot />{/if}
  </button>
{/if}
