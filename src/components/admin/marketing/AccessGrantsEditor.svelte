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
  <p class="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
    Superusers have access to every module and manage user access.
  </p>
{:else}
  <div class="grid gap-1.5 sm:grid-cols-2">
    {#each MODULES as module (module.key)}
      <label
        class="flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs transition {grants.includes(module.key) ? 'border-[#0f766e]/40 bg-teal-50/50' : 'border-gray-200 bg-white'} {disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-[#0f766e]/30'}"
        title={module.description}
      >
        <input
          type="checkbox"
          class="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-[#0f766e] focus:ring-[#0f766e]"
          checked={grants.includes(module.key)}
          {disabled}
          onchange={(event) => toggle(module.key, event.currentTarget.checked)}
        />
        <span class="font-bold leading-tight">{module.label}</span>
      </label>
    {/each}
  </div>
{/if}
