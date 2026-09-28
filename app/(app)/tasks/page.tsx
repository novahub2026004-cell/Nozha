import { ctx } from "@/lib/session";
import Board from "./board";

export default async function Page() {
  const { sb, admin, user } = await ctx();
  const [tasks, brs, mgrs] = await Promise.all([
    sb.from("tasks").select("*, branches(name), task_events(id,action,comment,file_name,from_status,to_status,created_at,profiles(full_name)), task_attachments(id,file_name,storage_path,kind)").order("created_at", { ascending: false }),
    sb.from("branches").select("id,name"),
    sb.from("profiles").select("id,branch_id").eq("role", "branch_manager"),
  ]);
  const managers = Object.fromEntries((mgrs.data ?? []).map((m) => [m.branch_id, m.id]));
  return <Board tasks={tasks.data ?? []} admin={admin} userId={user.id} branches={brs.data ?? []} managers={managers} />;
}
