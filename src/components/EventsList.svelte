<script>
  // Public events list, loaded client-side from Supabase so the board can
  // publish events from the dashboard without a site deploy. Renders nothing
  // if Supabase is unavailable or there are no events beyond the hand-built
  // featured sections above it.
  import { onMount } from "svelte";
  import {
    getSupabaseClient,
    SUPABASE_CONFIG_ERROR,
  } from "../lib/supabaseClient";

  // Slugs already featured as hand-designed sections on the page.
  export let excludeSlugs = [];

  let events = [];
  let hasLoaded = false;

  onMount(async () => {
    if (SUPABASE_CONFIG_ERROR) {
      hasLoaded = true;
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("events")
        .select(
          "id, slug, title, image_src, date_label, time_label, starts_on, ends_on, location, address, description, registration_link, registration_label, featured, recurring, tags",
        )
        .eq("published", true)
        .order("sort_order", { ascending: true })
        .order("starts_on", { ascending: true, nullsFirst: false });

      if (!error && data) {
        const excluded = new Set(excludeSlugs);
        const today = new Date();
        const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        events = data.filter((event) => {
          if (excluded.has(event.slug)) return false;
          if (event.recurring) return true;

          const lastDay = event.ends_on || event.starts_on;
          return !lastDay || lastDay >= todayKey;
        });
      }
    } catch {
      // Leave the page as-is when the events service is unreachable.
    }

    hasLoaded = true;
  });
</script>

{#if hasLoaded && events.length}
  <section class="bg-light-gray py-16 md:py-20" aria-labelledby="more-events-title">
    <div class="mx-auto max-w-7xl px-4">
      <div class="text-center">
        <h2
          id="more-events-title"
          class="font-sans text-3xl font-extrabold tracking-tight text-off-black sm:text-4xl"
        >
          More Upcoming Events
        </h2>
        <p class="mx-auto mt-3 max-w-2xl font-body text-lg text-medium-gray">
          Fresh from our community calendar.
        </p>
      </div>

      <div class="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {#each events as event (event.id)}
          <article class="flex flex-col overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition hover:shadow-md">
            {#if event.image_src}
              <div class="aspect-[4/3] w-full overflow-hidden bg-gray-100">
                <img
                  src={event.image_src}
                  alt={event.title}
                  class="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            {/if}
            <div class="flex flex-1 flex-col p-5">
              {#if event.tags?.length}
                <div class="mb-3 flex flex-wrap gap-1.5">
                  {#each event.tags as tag}
                    <span class="rounded-full bg-accent-gold/15 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-off-black">
                      {tag}
                    </span>
                  {/each}
                </div>
              {/if}

              <h3 class="font-sans text-xl font-extrabold leading-snug text-off-black">
                {event.title}
              </h3>

              <p class="mt-2 text-sm font-semibold text-off-black/70">
                {#if event.date_label}{event.date_label}{/if}
                {#if event.time_label}
                  · {event.time_label}
                {/if}
              </p>
              {#if event.location}
                <p class="mt-1 text-sm text-medium-gray">
                  {event.location}{event.address ? ` · ${event.address}` : ""}
                </p>
              {/if}

              {#if event.description}
                <p class="mt-3 flex-1 text-sm leading-relaxed text-medium-gray">
                  {event.description}
                </p>
              {/if}

              {#if event.registration_link}
                <a
                  href={event.registration_link}
                  target={event.registration_link.startsWith("http") ? "_blank" : undefined}
                  rel={event.registration_link.startsWith("http") ? "noopener noreferrer" : undefined}
                  class="btn group mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-accent-gold px-6 py-3 text-sm font-bold text-off-black transition-all duration-300 hover:scale-[1.02] hover:shadow-lg"
                >
                  {event.registration_label || "Learn More"}
                  <svg
                    class="h-4 w-4 transition-transform group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2.5"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                  </svg>
                </a>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    </div>
  </section>
{/if}
