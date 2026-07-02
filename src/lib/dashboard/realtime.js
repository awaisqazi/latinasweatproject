// Live dashboard updates over a single Realtime channel (one WebSocket per
// tab; the client multiplexes all four table subscriptions over it).
// INSERT/UPDATE events are RLS-scoped per subscriber; DELETE events carry
// only the primary key. Callers should treat events as "something changed"
// signals and re-derive state from payload.new / a refetch — never as the
// sole source of truth, since a dropped connection auto-reconnects without
// replaying missed events (the existing load-on-navigate behavior covers
// those gaps).

export function subscribeDashboardRealtime(
  supabase,
  { onProjects, onBoard, onWorkspace } = {},
) {
  if (!supabase) return () => {};

  const channel = supabase
    .channel("dashboard-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "projects" },
      (payload) => onProjects?.(payload),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "board_projects" },
      (payload) => onBoard?.(payload),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "board_project_tasks" },
      (payload) => onBoard?.(payload),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "workspace_tasks" },
      (payload) => onWorkspace?.(payload),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
