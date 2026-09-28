import { hhmm } from "@/components/ui";
const ST: Record<string, string> = { present: "حاضر", late: "متأخر", absent: "غائب", leave: "إجازة", created: "جديدة", received: "تم الاستلام", in_progress: "قيد التنفيذ",
  waiting_review: "بانتظار المراجعة", approved: "معتمدة", rejected: "مرفوضة", returned: "معادة للتعديل", closed: "مغلقة" };
const PR: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" };
export const REPORTS: Record<string, { title: string; view: string; date?: string; cols: [string, string][] }> = {
  attendance: { title: "تقرير الحضور والانصراف", view: "v_attendance_report", date: "work_date",
    cols: [["work_date", "التاريخ"], ["branch", "الفرع"], ["employee", "الموظف"], ["position", "الوظيفة"], ["status", "الحالة"], ["check_in", "الحضور"], ["check_out", "الانصراف"], ["notes", "ملاحظات"]] },
  tasks: { title: "تقرير المهام", view: "v_task_report", date: "created_at",
    cols: [["title", "المهمة"], ["branch", "الفرع"], ["priority", "الأولوية"], ["status", "الحالة"], ["assigned_to_name", "المسؤول"], ["created_at", "تاريخ الإنشاء"], ["closed_at", "تاريخ الإغلاق"]] },
  branches: { title: "مؤشرات الفروع", view: "v_branch_kpis",
    cols: [["name", "الفرع"], ["employees", "الموظفون"], ["attendance_pct", "الحضور %"], ["quality_pct", "الجودة %"], ["open_tasks", "مهام مفتوحة"], ["open_complaints", "بلاغات مفتوحة"]] },
};
const fmt = (k: string, v: any) => v == null ? "" : k === "status" ? ST[v] ?? v : k === "priority" ? PR[v] ?? v : k === "check_in" || k === "check_out" ? hhmm(v)
  : k === "created_at" || k === "closed_at" ? new Date(v).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }) : String(v);

export async function getReport(sb: any, type: string, p: { from?: string; to?: string; branch?: string }): Promise<{ r: (typeof REPORTS)[string]; rows: string[][] } | null> {
  const r = REPORTS[type]; if (!r) return null;
  let q = sb.from(r.view).select("*");
  if (p.branch && type !== "branches") q = q.eq("branch_id", p.branch); else if (p.branch) q = q.eq("branch_id", p.branch);
  if (r.date && p.from) q = q.gte(r.date, p.from);
  if (r.date && p.to) q = q.lte(r.date, r.date === "work_date" ? p.to : p.to + "T23:59:59");
  const { data } = await q.limit(5000);
  return { r, rows: (data ?? []).map((x: any) => r.cols.map(([k]) => fmt(k, x[k]))) };
}
