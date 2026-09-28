import { ctx } from "@/lib/session";
import { today } from "@/components/ui";
import Daily from "./client";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { sb, admin, profile, user } = await ctx();
  const { data: tpls } = await sb.from("checklist_templates").select("id,name,branch_id,checklist_items(id,section,label,sort_order,is_active)").eq("is_active", true).order("created_at");
  const branches = admin ? (await sb.from("branches").select("id,name").order("code")).data ?? [] : [];
  const branchId = admin ? sp.branch || branches[0]?.id : profile.branch_id;
  const date = sp.date || today();
  const available = (tpls ?? []).filter(t => !t.branch_id || t.branch_id === branchId);
  const tplId = available.some(t => t.id === sp.tpl) ? sp.tpl : available[0]?.id;
  const { data: report } = tplId && branchId
    ? await sb.from("daily_reports").select("id,notes,submitted_at,updated_at,correction_reason,profiles!daily_reports_submitted_by_fkey(full_name),daily_report_items(item_id,is_done)")
        .eq("branch_id", branchId).eq("template_id", tplId).eq("report_date", date).maybeSingle()
    : { data: null };
  return <Daily key={`${tplId}${branchId}${date}${report?.id}${report?.updated_at}`} tpls={available} tplId={tplId} branches={branches} branchId={branchId}
    date={date} report={report} admin={admin} userId={user.id} isToday={date === today()} />;
}
