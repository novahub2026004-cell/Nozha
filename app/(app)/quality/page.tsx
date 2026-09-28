import { ctx } from "@/lib/session";
import Quality from "./client";

export default async function Page() {
  const { sb, admin, profile, user } = await ctx();
  const [forms, subs, brs] = await Promise.all([
    sb.from("quality_forms").select("id,name,quality_sections(id,title,sort_order,is_active,quality_questions(id,text,max_score,sort_order,is_active))").eq("is_active", true).order("created_at"),
    sb.from("quality_submissions").select("id,form_id,percentage,total_score,max_total,notes,submitted_at,branches(name),profiles(full_name)").order("submitted_at", { ascending: false }).limit(50),
    sb.from("branches").select("id,name").order("code"),
  ]);
  return <Quality forms={forms.data ?? []} subs={subs.data ?? []} branches={brs.data ?? []} admin={admin} userId={user.id} myBranch={profile.branch_id} canFill={profile.role !== "employee"} />;
}
