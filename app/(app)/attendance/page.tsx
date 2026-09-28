import { ctx } from "@/lib/session";
import { card, hhmm, today, inp, btn } from "@/components/ui";
import AttendanceTable from "./table";

export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { sb, admin, profile } = await ctx();
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today();
  const [emps, att, brs] = await Promise.all([
    sb.from("employees").select("id,full_name,branch_id,shift_start").order("full_name"),
    sb.from("attendance").select("*").eq("work_date", date),
    sb.from("branches").select("id,name,opens_at,closes_at,is_24h,grace_minutes"),
  ]);
  const B: Record<string, any> = Object.fromEntries((brs.data ?? []).map((b) => [b.id, b]));
  const rows = (emps.data ?? []).map((e) => {
    const a = (att.data ?? []).find((x) => x.employee_id === e.id), b = B[e.branch_id];
    return { id: e.id, name: e.full_name, branch: b?.name, shift: b?.is_24h ? e.shift_start.slice(0, 5) : b?.opens_at.slice(0, 5),
      status: a?.status ?? "", cin: hhmm(a?.check_in), cout: hhmm(a?.check_out), note: a?.notes ?? "" };
  });
  const mine = B[profile.branch_id];
  return (
    <div className="space-y-4"><form className="flex flex-wrap items-center gap-2"><label>التاريخ <input className={inp} type="date" name="date" max={today()} defaultValue={date}/></label><button className={btn}>عرض السجلات</button></form>
      {mine && <div className={`${card} flex flex-wrap justify-between gap-2 font-semibold`}>
        <span>{mine.is_24h ? "🟢 الفرع يعمل 24 ساعة (ورديات)" : `ساعات العمل: ${mine.opens_at.slice(0, 5)} - ${mine.closes_at.slice(0, 5)}`}</span>
        <span className="font-normal text-gray-500">سماحية التأخير {mine.grace_minutes} دقيقة - التأخير يُحسب تلقائيًا من وقت الحضور</span></div>}
      <div className={card}><h2 className="mb-3 font-bold">{admin ? "تسجيل وتصحيح الحضور" : "حضور وانصراف اليوم"}</h2>
        <AttendanceTable rows={rows} date={date} editable={admin || date === today()} showBranch={admin || profile.role === "area_manager"} /></div>
    </div>
  );
}
