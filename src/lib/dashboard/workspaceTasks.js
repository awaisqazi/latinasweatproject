// Cross-module Workspace tasks: the org-wide assignment + notification feed.
// Anyone can assign a task to any teammate; it surfaces in that teammate's
// Workspace. Real access is enforced by RLS on public.workspace_tasks.

export const TASK_PRIORITIES = [
  { value: "P0", label: "Urgent (P0)" },
  { value: "P1", label: "High (P1)" },
  { value: "P2", label: "Normal (P2)" },
];

const TASK_COLUMNS =
  "id,title,note,assignee_id,assigned_by,due_date,priority,status,source_module,source_label,source_link,created_at,completed_at,seen_at";

// Open tasks assigned to me, soonest due first. Returns { tasks, error }.
export async function loadMyOpenTasks(supabase, profileId) {
  if (!supabase || !profileId) return { tasks: [], error: null };

  const { data, error } = await supabase
    .from("workspace_tasks")
    .select(TASK_COLUMNS)
    .eq("assignee_id", profileId)
    .eq("status", "open")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  return { tasks: data || [], error };
}

// Count of open tasks assigned to me, for the nav badge.
export async function countMyOpenTasks(supabase, profileId) {
  if (!supabase || !profileId) return 0;

  const { count, error } = await supabase
    .from("workspace_tasks")
    .select("id", { count: "exact", head: true })
    .eq("assignee_id", profileId)
    .eq("status", "open");

  return error ? 0 : count || 0;
}

export async function createTask(
  supabase,
  {
    assigneeId,
    assignedBy,
    title,
    note,
    dueDate,
    priority,
    sourceModule,
    sourceLabel,
    sourceLink,
  },
) {
  return supabase
    .from("workspace_tasks")
    .insert({
      assignee_id: assigneeId,
      assigned_by: assignedBy,
      title: String(title || "").trim(),
      note: note?.trim() || null,
      due_date: dueDate || null,
      priority: priority || "P2",
      source_module: sourceModule || null,
      source_label: sourceLabel || null,
      source_link: sourceLink || null,
    })
    .select(TASK_COLUMNS)
    .single();
}

export async function completeTask(supabase, taskId) {
  return supabase
    .from("workspace_tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();
}
