<script>
  import { MODULES } from "../../../lib/dashboard/modules";

  // Checkbox grid over the dashboard modules. `grants` is an array of module
  // keys; superusers implicitly have everything, so show a note instead.
  export let grants = [];
  export let isSuperuser = false;
  export let disabled = false;
  export let onChange = () => {};

  function toggle(moduleKey, checked) {
    const next = checked
      ? Array.from(new Set([...grants, moduleKey]))
      : grants.filter((key) => key !== moduleKey);

    onChange(next);
  }
</script>

{#if isSuperuser}
  <p class="rounded-control border border-ink/10 bg-ink/[0.04] px-3 py-2 text-xs font-semibold text-ink/65">
    Superusers have access to every module and manage user access.
  </p>
{:else}
  <div class="grid gap-1.5 sm:grid-cols-2">
    {#each MODULES as module (module.key)}
      <label
        class="flex items-start gap-2 rounded-control border px-2.5 py-2 text-xs transition {grants.includes(module.key) ? 'border-accent/40 bg-accent-soft/50' : 'border-ink/10 bg-white'} {disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-accent/30'}"
        title={module.description}
      >
        <input
          type="checkbox"
          class="mt-0.5 h-3.5 w-3.5 rounded border-ink/20 text-accent focus:ring-accent"
          checked={grants.includes(module.key)}
          {disabled}
          onchange={(event) => toggle(module.key, event.currentTarget.checked)}
        />
        <span class="font-bold leading-tight">{module.label}</span>
      </label>
    {/each}
  </div>
{/if}
