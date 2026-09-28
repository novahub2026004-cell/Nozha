"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { btn, card, inp, today } from "@/components/ui";

export default function Manager({ rows, branches, admin, canAdd, canDelete, defaultBranch }: any) {
  const sb = supabaseBrowser(), router = useRouter();
  const [f, setF] = useState({ name: "", position: "", phone: "", branch: defaultBranch, salary: "" });
  const [err, setErr] = useState("");
  const run = async (fn: () => PromiseLike<{ error: any }>) => { const { error } = await fn(); setErr(error?.message ?? ""); router.refresh(); };
  const add = async () => {
    if (!f.name.trim()) return;
    const { data, error } = await sb.from("employees").insert({ full_name: f.name, position: f.position, phone: f.phone, branch_id: f.branch, hire_date: today() }).select("id").single();
    if (error) return setErr(error.message);
    if (admin && f.salary) await sb.from("employee_salaries").insert({ employee_id: data.id, salary: +f.salary });
    setF({ ...f, name: "", position: "", phone: "", salary: "" }); setErr(""); router.refresh();
  };
  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className={card}><h2 className="mb-3 font-bold">إضافة موظف</h2>
        {canAdd ? (
          <div className="flex flex-wrap gap-2">
            <input className={inp} placeholder="الاسم" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <input className={inp} placeholder="الوظيفة" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} />
            <input className={inp} placeholder="الهاتف" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            {admin && <><select className={inp} value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              <input className={`${inp} w-28`} type="number" placeholder="المرتب" value={f.salary} onChange={(e) => setF({ ...f, salary: e.target.value })} /></>}
            <button className={btn} onClick={add}>إضافة</button>
          </div>) : <p className="text-sm text-gray-400">🔒 إضافة الموظفين غير مفعّلة من المدير العام</p>}
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead><tr className="text-gray-400">{["الاسم", "الوظيفة", "الهاتف", "الفرع", "تاريخ التعيين", ...(admin ? ["المرتب"] : []), ""].map((h) => <th key={h} className="p-2 text-right font-semibold">{h}</th>)}</tr></thead>
          <tbody>{rows.map((e: any) => (
            <tr key={e.id} className="border-t"><td className="p-2">{e.full_name}</td><td className="p-2">{e.position}</td><td className="p-2">{e.phone}</td><td className="p-2">{e.branch}</td><td className="p-2">{e.hire_date}</td>
              {admin && <td className="p-2"><input className={`${inp} w-24`} type="number" defaultValue={e.salary ?? ""} onBlur={(x) => x.target.value && +x.target.value !== e.salary && run(() => sb.from("employee_salaries").upsert({ employee_id: e.id, salary: +x.target.value, updated_at: new Date().toISOString() }))} /></td>}
              <td className="p-2">{canDelete && <button className="text-red-600" onClick={() => confirm("أرشفة الموظف؟") && run(() => sb.from("employees").update({ deleted_at: new Date().toISOString() }).eq("id", e.id))}>أرشفة</button>}</td></tr>))}</tbody>
        </table>
        {!admin && <p className="mt-2 text-xs text-gray-400">المرتبات لا تظهر لمدير الفرع</p>}
      </div>
    </div>
  );
}
