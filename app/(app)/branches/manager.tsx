"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { btn, card, inp } from "@/components/ui";

export default function Manager({ branches, managers, admin }: any) {
  const sb = supabaseBrowser(), router = useRouter();
  const [f, setF] = useState({ code: "", name: "", city: "" });
  const [account, setAccount] = useState({ name: "", username: "", password: "", branch: branches.find((b: any) => !managers.some((m: any) => m.branch_id === b.id))?.id ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (fn: () => PromiseLike<{ error: any }>) => { const { error } = await fn(); setErr(error?.message ?? ""); router.refresh(); };
  const upd = (id: string, patch: object) => run(() => sb.from("branches").update(patch).eq("id", id));
  const [resetId, setResetId] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const changeAccount = async (patch: object) => {
    setBusy(true); setErr("");
    try { const res = await fetch("/api/managers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const result = await res.json(); if (!res.ok) setErr(result.error); else { setResetId(""); setResetPassword(""); router.refresh(); }
    } catch { setErr("تعذر الاتصال بالخادم"); } finally { setBusy(false); }
  };
  const mgrOf = (b: string) => managers.find((m: any) => m.branch_id === b)?.id ?? "";
  const createManager = async () => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/managers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(account) });
      const data = await res.json();
      if (!res.ok) return setErr(data.error ?? "تعذر إنشاء الحساب");
      setAccount({ name: "", username: "", password: "", branch: "" });
      router.refresh();
    } catch { setErr("تعذر الاتصال بالخادم"); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-red-600">{err}</p>}
      {admin && <div className={card}><h2 className="mb-3 font-bold">إضافة فرع</h2><div className="flex flex-wrap gap-2">
        <input className={inp} placeholder="الكود (NZ-10)" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
        <input className={inp} placeholder="اسم الفرع" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={inp} placeholder="المدينة" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <button className={btn} onClick={async () => { if (f.code && f.name) { await run(() => sb.from("branches").insert({ code: f.code, name: f.name, city: f.city })); setF({ code: "", name: "", city: "" }); } }}>إضافة</button></div></div>}
      {admin && <div className={card}><h2 className="mb-3 font-bold">إنشاء حساب مدير فرع</h2>
        <div className="flex flex-wrap gap-2">
          <input className={inp} placeholder="اسم المدير" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} />
          <input className={inp} placeholder="اسم الدخول بالإنجليزية" value={account.username} onChange={(e) => setAccount({ ...account, username: e.target.value })} />
          <input className={inp} type="password" placeholder="كلمة مرور (8 أحرف على الأقل)" autoComplete="new-password" value={account.password} onChange={(e) => setAccount({ ...account, password: e.target.value })} />
          <select className={inp} value={account.branch} onChange={(e) => setAccount({ ...account, branch: e.target.value })}>
            <option value="">اختر فرعًا بدون مدير</option>{branches.filter((b: any) => !mgrOf(b.id)).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button className={btn} disabled={busy || !account.branch || managers.filter((m: any) => m.is_active).length >= 9} onClick={createManager}>{busy ? "جارٍ الإنشاء" : "إنشاء وربط بالفرع"}</button>
        </div>
        <p className="mt-2 text-xs text-gray-500">يُنشأ حساب مستقل لمدير الفرع، ولا يرى بيانات الفروع الأخرى.</p>
      </div>}
      {admin && <div className={card}>
        <h2 className="mb-1 text-lg font-extrabold">حسابات مديري الفروع</h2>
        <p className="mb-4 text-xs text-slate-500">{managers.filter((m: any) => m.is_active).length} من 9 مديري فروع + حساب المدير العام. الموظفون لا يحتاجون حسابات دخول.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{managers.map((m: any) => <div key={m.id} className="rounded-xl border border-slate-200 p-4">
          <b className="text-sm">{m.full_name}</b><p className="mt-1 text-xs text-slate-500">اسم الدخول: <span dir="ltr">{m.username}</span></p>
          <p className="text-xs text-slate-500">{branches.find((b: any) => b.id === m.branch_id)?.name ?? "بدون فرع"}</p>
          <div className="mt-3 flex gap-3 text-xs"><button className="font-bold text-blue-600" onClick={() => setResetId(m.id)}>تغيير كلمة المرور</button>
          <button disabled={busy} className={m.is_active ? "text-red-600" : "text-green-700"} onClick={() => changeAccount({id:m.id,active:!m.is_active})}>{m.is_active ? "إيقاف الحساب" : "تفعيل الحساب"}</button></div>
          {resetId === m.id && <div className="mt-3 space-y-2"><input autoComplete="new-password" type="password" className={`${inp} w-full`} placeholder="كلمة مرور جديدة" value={resetPassword} onChange={e => setResetPassword(e.target.value)} /><button disabled={busy || resetPassword.length < 8} className={btn} onClick={() => changeAccount({id:m.id,password:resetPassword})}>حفظ كلمة المرور</button></div>}
        </div>)}</div>
      </div>}
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead><tr className="text-gray-400">{["الكود", "الفرع", "24 ساعة", "الفتح", "الإغلاق", "سماحية (د)", "المدير المسؤول", ""].map((h) => <th key={h} className="p-2 text-right font-semibold">{h}</th>)}</tr></thead>
          <tbody>{branches.map((b: any) => (
            <tr key={b.id} className="border-t">
              <td className="p-2">{b.code}</td>
              <td className="p-2"><input className={`${inp} w-40`} disabled={!admin} defaultValue={b.name} onBlur={(e) => e.target.value !== b.name && upd(b.id, { name: e.target.value })} /></td>
              <td className="p-2"><input type="checkbox" disabled={!admin} checked={b.is_24h} onChange={(e) => upd(b.id, { is_24h: e.target.checked })} /></td>
              <td className="p-2"><input type="time" className={`${inp} w-28`} disabled={!admin || b.is_24h} defaultValue={b.opens_at.slice(0, 5)} onBlur={(e) => e.target.value && upd(b.id, { opens_at: e.target.value })} /></td>
              <td className="p-2"><input type="time" className={`${inp} w-28`} disabled={!admin || b.is_24h} defaultValue={b.closes_at.slice(0, 5)} onBlur={(e) => e.target.value && upd(b.id, { closes_at: e.target.value })} /></td>
              <td className="p-2"><input type="number" className={`${inp} w-20`} disabled={!admin} defaultValue={b.grace_minutes} onBlur={(e) => +e.target.value !== b.grace_minutes && upd(b.id, { grace_minutes: +e.target.value })} /></td>
              <td className="p-2"><select className={inp} disabled={!admin} value={mgrOf(b.id)} onChange={(e) => e.target.value && run(() => sb.rpc("assign_branch_manager", { b: b.id, u: e.target.value }))}>
                <option value="">— بدون مدير —</option>{managers.map((m: any) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</select></td>
              <td className="p-2">{admin && <button className="text-red-600" onClick={() => confirm("حذف الفرع؟ (يبقى السجل محفوظًا)") && run(() => sb.rpc("delete_branch", { b: b.id }))}>حذف</button>}</td>
            </tr>))}</tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">في الفروع 24 ساعة تُحدَّد وردية كل موظف من شاشة الحضور. أي تعديل في الساعات يصل لمدير الفرع فورًا.</p>
      </div>
    </div>
  );
}
