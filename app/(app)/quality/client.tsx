"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { btn, card, inp } from "@/components/ui";

const color = (p: number) => (p >= 90 ? "bg-green-100 text-green-800" : p >= 75 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800");

export default function Quality({ forms, subs, branches, admin, userId, myBranch, canFill }: any) {
  const sb = supabaseBrowser(), router = useRouter();
  const [fid, setFid] = useState(forms[0]?.id);
  const [bid, setBid] = useState(myBranch ?? branches[0]?.id);
  const [sc, setSc] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState(false);
  const [err, setErr] = useState("");
  const form = forms.find((f: any) => f.id === fid);
  const secs = (form?.quality_sections ?? []).filter((s: any) => s.is_active).sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((s: any) => ({ ...s, qs: s.quality_questions.filter((q: any) => q.is_active).sort((a: any, b: any) => a.sort_order - b.sort_order) }));
  const qs = secs.flatMap((s: any) => s.qs);
  const got = qs.reduce((a: number, q: any) => a + (sc[q.id] ?? 0), 0), max = qs.reduce((a: number, q: any) => a + Number(q.max_score), 0);
  const pct = max ? Math.round((got / max) * 100) : 0;
  const run = async (fn: () => PromiseLike<{ error: any }>) => { const { error } = await fn(); setErr(error?.message ?? ""); router.refresh(); };

  const submit = async () => {
    if (qs.some((q: any) => sc[q.id] === undefined)) return setErr("أجب على كل الأسئلة أولًا");
    const { error } = await sb.rpc("submit_quality_assessment", { form: fid, branch: bid, report_notes: note,
      entries: qs.map((q: any) => ({ question_id: q.id, score: sc[q.id] })) });
    if (error) return setErr(error.message);
    setErr(""); router.refresh();
    setSc({}); setNote("");
  };
  const addSection = () => { const t = prompt("اسم القسم (مثال: النظافة العامة)"); if (t) run(() => sb.from("quality_sections").insert({ form_id: fid, title: t, sort_order: secs.length + 1 })); };
  const addQ = (s: any) => {
    const text = prompt(`سؤال جديد في "${s.title}"`); if (!text) return;
    const m = +(prompt("الدرجة القصوى", "5") || 5);
    run(() => sb.from("quality_questions").insert({ section_id: s.id, text, max_score: m, sort_order: s.qs.length + 1 }));
  };
  const hide = (table: string, id: string) => confirm("حذف؟ (التقييمات القديمة تحتفظ به)") && run(() => sb.from(table).update({ is_active: false }).eq("id", id));
  const addForm = () => { const n = prompt("اسم نموذج التقييم"); if (n) run(() => sb.from("quality_forms").insert({ name: n, created_by: userId })); };

  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        <select className={inp} value={fid} onChange={(e) => { setFid(e.target.value); setSc({}); }}>{forms.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        {(admin || !myBranch) && <select className={inp} value={bid} onChange={(e) => setBid(e.target.value)}>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
        <span className={`rounded-full px-3 py-1 text-sm ${color(pct)}`}>النتيجة الحالية: {pct}% ({got}/{max})</span>
        {admin && <div className="mr-auto flex gap-2"><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => setEdit(!edit)}>{edit ? "إنهاء التعديل" : "✏️ تعديل النموذج"}</button>
          {edit && <button className="rounded-lg border px-3 py-2 text-sm" onClick={addForm}>+ نموذج جديد</button>}</div>}
      </div>
      {secs.map((s: any) => (
        <div key={s.id} className={card}>
          <div className="mb-2 flex items-center justify-between"><h3 className="font-bold">{s.title}</h3>
            {edit && <div className="flex gap-3 text-sm"><button className="text-[#1a6fd8]" onClick={() => addQ(s)}>+ سؤال</button><button className="text-red-600" onClick={() => hide("quality_sections", s.id)}>حذف القسم</button></div>}</div>
          {s.qs.map((q: any) => (
            <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-2">
              <span>{q.text} <small className="text-gray-400">(من {q.max_score})</small></span>
              <span className="flex items-center gap-2">
                {canFill && <select className={inp} value={sc[q.id] ?? ""} onChange={(e) => setSc({ ...sc, [q.id]: +e.target.value })}>
                  <option value="">—</option>{Array.from({ length: Math.floor(q.max_score) + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}</select>}
                {edit && <button className="text-red-600" onClick={() => hide("quality_questions", q.id)}>✕</button>}</span>
            </div>))}
        </div>))}
      {secs.length === 0 && <div className={`${card} text-gray-400`}>النموذج فارغ{admin ? " - اضغط تعديل ثم أضف قسمًا" : ""}</div>}
      {edit && <button className={btn} onClick={addSection}>+ إضافة قسم</button>}
      {canFill && qs.length > 0 && !edit && <div className={`${card} space-y-2`}>
        <textarea className={`${inp} w-full`} rows={2} placeholder="ملاحظات (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className={btn} onClick={submit}>تسليم التقييم</button><p className="text-xs text-gray-400">النسبة النهائية تُحسب تلقائيًا في قاعدة البيانات.</p></div>}
      <div className={`${card} overflow-x-auto`}><h3 className="mb-2 font-bold">آخر التقييمات</h3>
        <table className="w-full text-sm"><thead><tr className="text-gray-400">{["الفرع", "بواسطة", "التاريخ", "النسبة"].map((h) => <th key={h} className="p-2 text-right font-semibold">{h}</th>)}</tr></thead>
          <tbody>{subs.map((x: any) => (<tr key={x.id} className="border-t"><td className="p-2">{x.branches?.name}</td><td className="p-2">{x.profiles?.full_name}</td>
            <td className="p-2">{new Date(x.submitted_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</td>
            <td className="p-2"><span className={`rounded-full px-2 py-0.5 ${color(x.percentage)}`}>{Math.round(x.percentage)}%</span></td></tr>))}</tbody></table>
        {subs.length === 0 && <p className="p-3 text-gray-400">لا توجد تقييمات بعد</p>}</div>
    </div>
  );
}
