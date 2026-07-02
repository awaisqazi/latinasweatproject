// Cross-module Workspace tasks: the org-wide assignment + notification feed.
// Anyone can assign a task to any teammate; it surfaces in that teammate's
// Workspace. Real access is enforced by RLS on public.workspace_tasks.
// source_ref links a task to the module record that owns it (e.g.
// "board_task:<uuid>"); DB triggers keep both sides' status in sync.

export const TASK_PRIORITIES = [
  { value: "P0", label: "Urgent (P0)" },
  { value: "P1", label: "High (P1)" },
  { value: "P2", label: "Normal (P2)" },
];

const TASK_COLUMNS =
  "id,title,note,assignee_id,assigned_by,due_date,priority,status,source_module,source_label,source_link,source_ref,created_at,completed_at,seen_at";

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

// Completed tasks assigned to me, most recently completed first, so nothing
// disappears forever when it is cleared. Returns { tasks, error }.
export async function loadMyDoneTasks(supabase, profileId, limit = 100) {
  if (!supabase || !profileId) return { tasks: [], error: null };

  const { data, error } = await supabase
    .from("workspace_tasks")
    .select(TASK_COLUMNS)
    .eq("assignee_id", profileId)
    .eq("status", "done")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  return { tasks: data || [], error };
}

// Everything ever sent to me through the Feedback button, open or cleared,
// newest first. Returns { tasks, error }.
export async function loadMyFeedbackTasks(supabase, profileId) {
  if (!supabase || !profileId) return { tasks: [], error: null };

  const { data, error } = await supabase
    .from("workspace_tasks")
    .select(TASK_COLUMNS)
    .eq("assignee_id", profileId)
    .eq("source_module", "feedback")
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

// Record an already-finished piece of work directly into History (e.g. a
// completed marketing-project assignment, which otherwise leaves no trace
// once the user's email is removed from the project).
export async function logDoneItem(
  supabase,
  { assigneeId, title, note, sourceModule, sourceLabel, sourceLink },
) {
  return supabase
    .from("workspace_tasks")
    .insert({
      assignee_id: assigneeId,
      assigned_by: assigneeId,
      title: String(title || "").trim(),
      note: note?.trim() || null,
      priority: "P2",
      status: "done",
      completed_at: new Date().toISOString(),
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

export async function reopenTask(supabase, taskId) {
  return supabase
    .from("workspace_tasks")
    .update({ status: "open", completed_at: null })
    .eq("id", taskId)
    .select(TASK_COLUMNS)
    .single();
}
