"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { btn, card, inp } from "@/components/ui";

const L: Record<string, string> = { created: "جديدة", received: "تم الاستلام", in_progress: "قيد التنفيذ", waiting_review: "بانتظار المراجعة", approved: "معتمدة", rejected: "مرفوضة", returned: "معادة للتعديل", closed: "مغلقة" };
const PR: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" };
const MIME: Record<string, string> = { "image/jpeg": "image", "image/png": "image", "image/webp": "image", "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "excel", "application/vnd.ms-excel": "excel" };

export default function Board({ tasks, admin, userId, branches, managers }: any) {
  const sb = supabaseBrowser(), router = useRouter();
  const [err, setErr] = useState("");
  const [txt, setTxt] = useState<Record<string, string>>({});
  const [nt, setNt] = useState({ title: "", branch: branches[0]?.id ?? "", pri: "medium" });
  const done = async (p: PromiseLike<{ error: any }>) => { const { error } = await p; setErr(error?.message ?? ""); router.refresh(); };
  const say = async (t: any, action: "comment" | "note") => {
    const c = (txt[t.id] || "").trim(); if (!c) return;
    setTxt({ ...txt, [t.id]: "" });
    await done(sb.from("task_events").insert({ task_id: t.id, actor_id: userId, action, comment: c }));
  };
  const move = async (t: any, to: string) => {
    const c = (txt[t.id] || "").trim();
    if ((to === "rejected" || to === "returned") && !c) return setErr("اكتب السبب أولًا في خانة الرد");
    if (c) await say(t, "comment");
    await done(sb.from("tasks").update({ status: to }).eq("id", t.id));
  };
  const up = async (t: any, f: File) => {
    const kind = MIME[f.type];
    if (!kind) return setErr("نوع الملف غير مسموح (صور / PDF / Excel فقط)");
    if (f.size > 20 * 1024 * 1024) return setErr("الحد الأقصى 20MB");
    const path = `${t.branch_id}/${t.id}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
    const u = await sb.storage.from("task-files").upload(path, f, { contentType: f.type });
    if (u.error) return setErr(u.error.message);
    await done(sb.from("task_attachments").insert({ task_id: t.id, kind, file_name: f.name, storage_path: path, mime_type: f.type, size_bytes: f.size }));
  };
  const openFile = async (p: string) => { const { data } = await sb.storage.from("task-files").createSignedUrl(p, 60); if (data) window.open(data.signedUrl); };
  const create = async () => {
    if (!nt.title.trim()) return;
    const m = managers[nt.branch]; if (!m) return setErr("لا يوجد مدير معيّن لهذا الفرع");
    await done(sb.from("tasks").insert({ title: nt.title, branch_id: nt.branch, assigned_to: m, created_by: userId, priority: nt.pri }));
    setNt({ ...nt, title: "" });
  };
  const B = (t: any, to: string, label: string, cls = btn) => <button key={to} className={cls} onClick={() => move(t, to)}>{label}</button>;
  const evText = (e: any) => e.action === "status_changed" ? `${L[e.from_status] ?? ""} ← ${L[e.to_status]}` : e.action === "file_uploaded" ? `رفع ملف: ${e.file_name}` : e.action === "created" ? "أنشأ المهمة" : `${e.action === "note" ? "ملاحظة" : "رد"}: ${e.comment}`;

  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-red-600">{err}</p>}
      {admin && <div className={card}><h2 className="mb-3 font-bold">إنشاء مهمة</h2><div className="flex flex-wrap gap-2">
        <input className={`${inp} w-60`} placeholder="عنوان المهمة" value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} />
        <select className={inp} value={nt.branch} onChange={(e) => setNt({ ...nt, branch: e.target.value })}>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className={inp} value={nt.pri} onChange={(e) => setNt({ ...nt, pri: e.target.value })}>{Object.entries(PR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className={btn} onClick={create}>إرسال المهمة</button></div></div>}
      {tasks.length === 0 && <div className={`${card} text-gray-400`}>لا توجد مهام</div>}
      {tasks.map((t: any) => {
        const s = t.status, working = ["received", "in_progress", "returned", "rejected"].includes(s);
        const events = [...t.task_events].sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
        return (
          <div key={t.id} className={card}>
            <div className="flex flex-wrap items-center justify-between gap-2"><b>{t.title}</b>
              <span className="text-sm">{t.branches?.name} · {PR[t.priority]} · <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-800">{L[s]}</span></span></div>
            {t.task_attachments.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{t.task_attachments.map((a: any) =>
              <button key={a.id} onClick={() => openFile(a.storage_path)} className="rounded-lg bg-gray-100 px-2 py-1 text-xs">📎 {a.file_name}</button>)}</div>}
            <ul className="mt-2 border-r-2 pr-3 text-xs text-gray-600">{events.slice(-8).map((e: any) => (
              <li key={e.id} className="py-0.5"><span className="text-gray-400">{new Date(e.created_at).toLocaleString("ar-EG")}</span> <b>{e.profiles?.full_name}</b>: {evText(e)}</li>))}</ul>
            <div className="mt-3 flex flex-wrap gap-2">
              {!admin && s === "created" && B(t, "received", "استلام المهمة")}
              {!admin && s === "received" && B(t, "in_progress", "بدء التنفيذ")}
              {!admin && (s === "returned" || s === "rejected") && B(t, "in_progress", "بدء التعديل")}
              {!admin && ["received", "in_progress"].includes(s) && B(t, "waiting_review", "تم الإنجاز", "rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white")}
              {admin && s === "waiting_review" && <>{B(t, "approved", "اعتماد", "rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white")}
                {B(t, "rejected", "رفض", "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white")}
                {B(t, "returned", "إعادة للتعديل", "rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white")}</>}
              {admin && (s === "approved" || s === "rejected") && B(t, "closed", "إغلاق المهمة")}
            </div>
            {s !== "closed" && (admin || s !== "created") && (
              <div className="mt-2 flex flex-wrap gap-2">
                <input className={`${inp} min-w-[180px] flex-1`} placeholder={admin ? "رد / سبب الرفض أو الإعادة" : "رد أو ملاحظة"} value={txt[t.id] ?? ""} onChange={(e) => setTxt({ ...txt, [t.id]: e.target.value })} />
                <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => say(t, "comment")}>رد</button>
                {!admin && <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => say(t, "note")}>ملاحظة</button>}
                {!admin && working && <label className="cursor-pointer rounded-lg border px-3 py-2 text-sm">📎 رفع ملف (صورة / PDF / Excel)
                  <input type="file" hidden accept="image/*,.pdf,.xls,.xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) up(t, f); e.target.value = ""; }} /></label>}
              </div>)}
          </div>);
      })}
    </div>
  );
}
