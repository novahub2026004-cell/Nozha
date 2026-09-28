import { ctx } from "@/lib/session";
import Client from "./client";

export default async function Page() {
  const { sb, admin, profile, user } = await ctx();
  const sel = "id,title,details,status,created_at,priority,branches(name),profiles(full_name)";
  const [c, m, b] = await Promise.all([
    sb.from("complaints").select(sel.replace(",priority", "")).order("created_at", { ascending: false }),
    sb.from("maintenance_requests").select(sel).order("created_at", { ascending: false }),
    sb.from("branches").select("id,name").order("code"),
  ]);
  return <Client complaints={c.data ?? []} maint={m.data ?? []} branches={b.data ?? []} canManage={admin || profile.role === "area_manager"} myBranch={profile.branch_id} userId={user.id} />;
}
