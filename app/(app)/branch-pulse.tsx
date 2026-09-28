import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

/** One operational snapshot for the director; RLS limits branch managers to their branch. */
export default async function BranchPulse({ date }: { date: string }) {
  const sb = await supabaseServer();
  const [brs, emps, att, tpls, reports, tasks, complaints, maint] = await Promise.all([
    sb.from("branches").select("id,name,code").order("code"),
    sb.from("employees").select("id,branch_id"),
    sb.from("attendance").select("branch_id,status").eq("work_date", date),
    sb.from("checklist_templates").select("id,branch_id,name").eq("is_active", true),
    sb.from("daily_reports").select("branch_id,template_id").eq("report_date", date),
    sb.from("tasks").select("branch_id,status").in("status", ["created", "received", "in_progress", "waiting_review", "returned", "rejected"]),
    sb.from("complaints").select("branch_id").in("status", ["open", "in_progress"]),
    sb.from("maintenance_requests").select("branch_id").in("status", ["open", "in_progress"]),
  ]);
  const branches = brs.data ?? [];
  const employees = emps.data ?? [];
  const attendance = att.data ?? [];
  const templates = tpls.data ?? [];
  const submitted = reports.data ?? [];
  const openTasks = tasks.data ?? [];
  const openComplaints = complaints.data ?? [];
  const openMaintenance = maint.data ?? [];
  const pending = branches.flatMap((branch) => templates.filter((tpl) => !tpl.branch_id || tpl.branch_id === branch.id)
    .filter((tpl) => !submitted.some((rep) => rep.branch_id === branch.id && rep.template_id === tpl.id))
    .map((tpl) => ({ branch, tpl })));

  return <section className="rounded-2xl border border-[#e8edf3] bg-white p-5 shadow-[0_8px_28px_rgba(22,48,73,0.04)] sm:p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-lg font-extrabold text-[#152b43]">حالة الفروع اليوم</h2><p className="text-xs text-[#718398]">الروتين والحضور والمهام والبلاغات، في مكان واحد</p></div>
      <Link href="/daily" className="rounded-xl bg-[#e9f6f5] px-3 py-2 text-xs font-bold text-[#087f83] transition hover:bg-[#d5eeec]">فتح الروتين اليومي ←</Link>
    </div>
    {branches.length === 0 ? <p className="text-sm text-[#718398]">لا توجد فروع متاحة لهذا الحساب.</p> :
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{branches.map((branch) => {
        const required = templates.filter((t) => !t.branch_id || t.branch_id === branch.id);
        const done = required.filter((t) => submitted.some((r) => r.branch_id === branch.id && r.template_id === t.id)).length;
        const staff = employees.filter((e) => e.branch_id === branch.id).length;
        const recorded = attendance.filter((a) => a.branch_id === branch.id).length;
        const absent = attendance.filter((a) => a.branch_id === branch.id && a.status === "absent").length;
        const work = openTasks.filter((t) => t.branch_id === branch.id).length;
        const issues = openComplaints.filter((c) => c.branch_id === branch.id).length + openMaintenance.filter((m) => m.branch_id === branch.id).length;
        const completed = required.length > 0 && done === required.length;
        return <div key={branch.id} className="rounded-2xl border border-[#e4ebf1] bg-[#fbfcfe] p-4 transition hover:border-[#8dcac6] hover:shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2"><b className="text-sm text-[#152b43]">{branch.name}</b><span className="rounded-lg bg-white px-2 py-1 text-xs text-[#718398]">{branch.code}</span></div>
          <div className="mb-3 flex items-center justify-between text-xs"><span className="text-[#667b8e]">الروتين اليومي</span><strong className={completed ? "text-[#188053]" : "text-[#ae6820]"}>{required.length === 0 ? "لا توجد قائمة" : completed ? "مكتمل" : `${done} من ${required.length}`}</strong></div>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-[#e5ebf0]" role="progressbar" aria-label={`الروتين اليومي في ${branch.name}`} aria-valuenow={done} aria-valuemin={0} aria-valuemax={required.length || 1}>
            <div className={`h-full rounded-full ${completed ? "bg-[#25a778]" : "bg-[#dba353]"}`} style={{ width: `${required.length ? done / required.length * 100 : 0}%` }} />
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <span className="rounded-lg bg-[#e9f2fc] px-2 py-1 text-[#35579d]">الحضور {recorded}/{staff}</span>
            {absent > 0 && <span className="rounded-lg bg-[#fce9ea] px-2 py-1 text-[#b74248]">غياب {absent}</span>}
            <span className="rounded-lg bg-[#edf2f7] px-2 py-1 text-[#516779]">مهام {work}</span>
            {issues > 0 && <span className="rounded-lg bg-[#fff0d9] px-2 py-1 text-[#ae6820]">بلاغات وصيانة {issues}</span>}
          </div>
          <Link className="mt-4 inline-block text-xs font-bold text-[#087f83]" href={`/daily?branch=${encodeURIComponent(branch.id)}&date=${date}`}>تفاصيل الفرع ←</Link>
        </div>;
      })}</div>}
    {pending.length > 0 && <div className="mt-5 border-t border-[#e8edf3] pt-4">
      <h3 className="mb-2 text-sm font-bold text-[#152b43]">بانتظار تسليم الروتين · {pending.length}</h3>
      <div className="flex flex-wrap gap-2">{pending.map(({ branch, tpl }) => <Link key={`${branch.id}-${tpl.id}`}
        href={`/daily?branch=${encodeURIComponent(branch.id)}&tpl=${encodeURIComponent(tpl.id)}&date=${date}`}
        className="rounded-xl bg-[#fff5e5] px-3 py-2 text-xs font-semibold text-[#94621f]">{branch.name} · {tpl.name}</Link>)}</div>
    </div>}
  </section>;
}
