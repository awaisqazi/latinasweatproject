<script>
  import { Inbox } from "@lucide/svelte";

  export let title;
  export let message;
</script>

<div
  class="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center"
>
  <Inbox class="mx-auto h-7 w-7 text-gray-400" aria-hidden="true" />
  <h4 class="mt-3 font-bold">{title}</h4>
  <p class="mx-auto mt-1 max-w-md text-sm leading-6 text-gray-600">
    {message}
  </p>
</div>
