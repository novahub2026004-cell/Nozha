import { ctx } from "@/lib/session";
import { card } from "@/components/ui";

const short = (v: any) => (v == null ? "-" : JSON.stringify(v).slice(0, 80));
export default async function Page() {
  const { sb } = await ctx();
  const { data } = await sb.from("activity_log").select("id,action,entity,old_value,new_value,created_at,profiles(full_name),branches(name)").order("created_at", { ascending: false }).limit(150);
  return (
    <div className={`${card} overflow-x-auto`}><h2 className="mb-3 font-bold">سجل الأنشطة</h2>
      <table className="w-full text-sm"><thead><tr className="text-gray-400">{["التاريخ والوقت", "المستخدم", "الفرع", "العملية", "الجدول", "القيمة القديمة", "القيمة الجديدة"].map((h) => <th key={h} className="p-2 text-right font-semibold">{h}</th>)}</tr></thead>
        <tbody>{(data ?? []).map((l: any) => (
          <tr key={l.id} className="border-t"><td className="whitespace-nowrap p-2">{new Date(l.created_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</td>
            <td className="p-2">{l.profiles?.full_name ?? "النظام"}</td><td className="p-2">{l.branches?.name ?? "-"}</td><td className="p-2">{l.action}</td><td className="p-2">{l.entity}</td>
            <td className="max-w-[200px] truncate p-2 text-gray-500" title={short(l.old_value)}>{short(l.old_value)}</td><td className="max-w-[200px] truncate p-2 text-gray-500" title={short(l.new_value)}>{short(l.new_value)}</td></tr>))}</tbody></table>
      {(data ?? []).length === 0 && <p className="p-3 text-gray-400">لا توجد أنشطة بعد</p>}
    </div>
  );
}
