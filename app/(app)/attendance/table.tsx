"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { inp } from "@/components/ui";

const ST = [["present", "حاضر", "bg-green-600"], ["late", "متأخر", "bg-amber-600"], ["absent", "غائب", "bg-red-600"], ["leave", "إجازة", "bg-blue-600"]] as const;

export default function AttendanceTable({ rows, showBranch, date, editable }: { rows: any[]; showBranch: boolean; date: string; editable: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const save = async (r: any, p: { st?: string; cin?: string; cout?: string; nt?: string }) => {
    const st = p.st ?? (r.status || (p.cin || p.cout ? "present" : null));
    if (!st) return;
    const { error } = await supabaseBrowser().rpc("record_attendance", { emp: r.id, st, cin: p.cin || null, cout: p.cout || null, nt: p.nt ?? null, work_day: date });
    setErr(error?.message ?? ""); router.refresh();
  };
  return (
    <div className="overflow-x-auto">
      {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
      <table className="w-full text-sm">
        <thead><tr className="text-gray-400">{["الموظف", ...(showBranch ? ["الفرع"] : []), "الوردية", "الحالة", "وقت الحضور", "وقت الانصراف", "ملاحظة"].map((h) => <th key={h} className="p-2 text-right font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id} className="border-t">
            <td className="p-2">{r.name}</td>{showBranch && <td className="p-2">{r.branch}</td>}<td className="p-2">{r.shift}</td>
            <td className="p-2 whitespace-nowrap">{ST.map(([v, l, c]) => (
              <button key={v} disabled={!editable} onClick={() => save(r, { st: v })}
                className={`ml-1 rounded-lg border px-2.5 py-1 ${r.status === v ? `${c} border-transparent text-white` : "bg-white"}`}>{l}</button>))}</td>
            <td className="p-2"><input disabled={!editable} type="time" className={`${inp} w-28`} defaultValue={r.cin} key={"i" + r.id + r.cin} onBlur={(e) => e.target.value !== r.cin && save(r, { cin: e.target.value })} /></td>
            <td className="p-2"><input disabled={!editable} type="time" className={`${inp} w-28`} defaultValue={r.cout} key={"o" + r.id + r.cout} onBlur={(e) => e.target.value !== r.cout && save(r, { cout: e.target.value })} /></td>
            <td className="p-2"><input disabled={!editable} className={`${inp} w-40`} placeholder="ملاحظة" defaultValue={r.note} key={"n" + r.id + r.note} onBlur={(e) => e.target.value !== r.note && save(r, { nt: e.target.value })} /></td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}
