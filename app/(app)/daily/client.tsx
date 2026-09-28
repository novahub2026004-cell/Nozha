"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { btn, card, inp } from "@/components/ui";

export default function Daily({ tpls, tplId, branches, branchId, date, report, admin, userId, isToday }: any) {
  const sb = supabaseBrowser(), router = useRouter();
  const tpl = tpls.find((t: any) => t.id === tplId);
  const saved: Record<string, boolean> = Object.fromEntries((report?.daily_report_items ?? []).map((x: any) => [x.item_id, x.is_done]));
  const items = (tpl?.checklist_items ?? []).filter((i: any) => report ? i.id in saved : i.is_active).sort((a: any, b: any) => a.sort_order - b.sort_order);
  const [chk, setChk] = useState<Record<string, boolean>>(saved);
  const [note, setNote] = useState(report?.notes ?? "");
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState("");
  const [correct, setCorrect] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const go = (p: object) => router.push("/daily?" + new URLSearchParams({ tpl: tplId, branch: branchId, date, ...p } as any));
  const run = async (fn: () => PromiseLike<{ error: any }>) => { const { error } = await fn(); setErr(error?.message ?? ""); router.refresh(); };
  const sections = [...new Set(items.map((i: any) => i.section))] as string[];
  const done = items.filter((i: any) => chk[i.id]).length, pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const locked = admin ? !correct : !!report || !isToday;

  const submit = async () => {
    if (busy) return;
    if (admin && reason.trim().length < 3) return setErr("اكتب سبب التعديل أولًا لحفظه في سجل المتابعة");
    setBusy(true);
    const payload = {
      tpl: tplId, branch: branchId, report_notes: note,
      entries: items.map((i: any) => ({ item_id: i.id, is_done: !!chk[i.id] })),
    };
    const { error } = admin ? await sb.rpc("admin_save_daily_report", { ...payload, report_day: date, reason }) : await sb.rpc("submit_daily_checklist", payload);
    setBusy(false);
    setErr(error?.message ?? "");
    if (!error) router.refresh();
  };
  const addItem = (section?: string) => {
    const sec = section ?? prompt("اسم القسم (مثال: النظافة، الثلاجات)"); if (!sec) return;
    const label = prompt(`البند الجديد في "${sec}"`); if (!label) return;
    run(() => sb.from("checklist_items").insert({ template_id: tplId, section: sec, label, sort_order: items.length + 1 }));
  };
  const hide = (ids: string[]) => confirm("حذف؟ (التقارير القديمة تحتفظ بالبند)") && run(() => sb.from("checklist_items").update({ is_active: false }).in("id", ids));
  const addTpl = () => { const n = prompt("اسم القائمة الجديدة"); if (n) run(() => sb.from("checklist_templates").insert({ name: n })); };

  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        <select className={inp} value={tplId} onChange={(e) => go({ tpl: e.target.value })}>{tpls.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        {admin && <select className={inp} value={branchId} onChange={(e) => go({ branch: e.target.value })}>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
        <input type="date" className={inp} value={date} onChange={(e) => e.target.value && go({ date: e.target.value })} />
        <span className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800">الإنجاز: {pct}% ({done}/{items.length})</span>
        {admin && <div className="mr-auto flex gap-2"><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setEdit(!edit)}>{edit ? "إنهاء التعديل" : "✏️ تعديل القائمة"}</button>
          <button className={btn} onClick={() => setCorrect(!correct)}>{correct ? "إلغاء التصحيح" : report ? "تصحيح التقرير" : "تسجيل التقرير"}</button>
          {edit && <button className="rounded-lg border px-3 py-2 text-sm" onClick={addTpl}>+ قائمة جديدة</button>}</div>}
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-gray-200"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div>
      {report && <p className="text-sm text-green-700">✓ تم تسليم التقرير بواسطة {report.profiles?.full_name} - {new Date(report.submitted_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</p>}
      {report?.notes && locked && <p className={`${card} text-sm`}>ملاحظات التقرير: {report.notes}</p>}
      {report?.correction_reason && <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800">تصحيح المدير العام: {report.correction_reason}</p>}
      {!report && admin && <p className="text-sm text-amber-600">لم يُسلَّم تقرير هذا الفرع في هذا التاريخ بعد</p>}
      {sections.map((s) => (
        <div key={s} className={card}>
          <div className="mb-2 flex items-center justify-between"><h3 className="font-bold">{s}</h3>
            {edit && <div className="flex gap-3 text-sm"><button className="text-[#1a6fd8]" onClick={() => addItem(s)}>+ بند</button>
              <button className="text-red-600" onClick={() => hide(items.filter((i: any) => i.section === s).map((i: any) => i.id))}>حذف القسم</button></div>}</div>
          {items.filter((i: any) => i.section === s).map((i: any) => (
            <div key={i.id} className="flex items-center justify-between py-1.5">
              <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" disabled={locked} checked={!!chk[i.id]} onChange={(e) => setChk({ ...chk, [i.id]: e.target.checked })} /> {i.label}</label>
              {edit && <button className="text-red-600" onClick={() => hide([i.id])}>✕</button>}
            </div>))}
        </div>))}
      {items.length === 0 && <div className={`${card} text-gray-400`}>القائمة فارغة{admin ? " - اضغط تعديل ثم أضف قسمًا" : ""}</div>}
      {edit && <button className={btn} onClick={() => addItem()}>+ إضافة قسم / بند جديد</button>}
      {!locked && items.length > 0 && (
        <div className={`${card} space-y-2`}><textarea className={`${inp} w-full`} rows={2} placeholder="ملاحظات على تقرير اليوم (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
          {admin && <input className={`${inp} w-full`} placeholder="سبب التصحيح (يظهر في سجل التعديلات)" value={reason} onChange={e => setReason(e.target.value)} />}
          <button className={btn} disabled={busy} onClick={submit}>{busy ? "جارٍ الحفظ" : admin ? "حفظ التصحيح" : "تسليم تقرير اليوم"}</button></div>)}
    </div>
  );
}
