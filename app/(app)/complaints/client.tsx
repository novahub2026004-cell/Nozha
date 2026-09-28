"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { btn, card, inp } from "@/components/ui";

const L: Record<string, string> = { open: "مفتوح", in_progress: "قيد المعالجة", resolved: "تم الحل", closed: "مغلق" };
const NEXT: Record<string, [string, string]> = { open: ["in_progress", "بدء المعالجة"], in_progress: ["resolved", "تم الحل"], resolved: ["closed", "إغلاق"] };
const PR: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" };

export default function Client({ complaints, maint, branches, canManage, myBranch, userId }: any) {
  const sb = supabaseBrowser(), router = useRouter();
  const [tab, setTab] = useState("complaints");
  const [f, setF] = useState({ title: "", details: "", priority: "medium", branch: myBranch ?? branches[0]?.id });
  const [err, setErr] = useState("");
  const rows = tab === "complaints" ? complaints : maint;
  const add = async () => {
    if (!f.title.trim()) return;
    const row: any = { branch_id: f.branch, title: f.title, details: f.details, created_by: userId };
    if (tab === "maintenance_requests") row.priority = f.priority;
    const { error } = await sb.from(tab).insert(row);
    setErr(error?.message ?? ""); if (!error) setF({ ...f, title: "", details: "" }); router.refresh();
  };
  const mv = async (r: any, to: string) => {
    const { error } = await sb.from(tab).update({ status: to, ...(to === "resolved" ? { resolved_at: new Date().toISOString() } : {}) }).eq("id", r.id);
    setErr(error?.message ?? ""); router.refresh();
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2">{[["complaints", "البلاغات"], ["maintenance_requests", "طلبات الصيانة"]].map(([k, l]) =>
        <button key={k} onClick={() => setTab(k)} className={`rounded-xl px-4 py-2 text-sm ${tab === k ? "bg-[#1a6fd8] text-white" : "bg-white"}`}>{l}</button>)}</div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className={card}><h2 className="mb-3 font-bold">{tab === "complaints" ? "+ بلاغ جديد" : "+ طلب صيانة جديد"}</h2>
        <div className="flex flex-wrap gap-2">
          {(canManage || !myBranch) && <select className={inp} value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
          <input className={`${inp} w-56`} placeholder="العنوان" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input className={`${inp} min-w-[200px] flex-1`} placeholder="التفاصيل" value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} />
          {tab === "maintenance_requests" && <select className={inp} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{Object.entries(PR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
          <button className={btn} onClick={add}>إرسال</button></div></div>
      <div className={`${card} overflow-x-auto`}><table className="w-full text-sm">
        <thead><tr className="text-gray-400">{["العنوان", "الفرع", "بواسطة", "التاريخ", ...(tab !== "complaints" ? ["الأولوية"] : []), "الحالة", ""].map((h) => <th key={h} className="p-2 text-right font-semibold">{h}</th>)}</tr></thead>
        <tbody>{rows.map((r: any) => (
          <tr key={r.id} className="border-t"><td className="p-2"><b>{r.title}</b><small className="block text-gray-500">{r.details}</small></td><td className="p-2">{r.branches?.name}</td><td className="p-2">{r.profiles?.full_name}</td>
            <td className="p-2">{new Date(r.created_at).toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" })}</td>{tab !== "complaints" && <td className="p-2">{PR[r.priority]}</td>}
            <td className="p-2"><span className={`rounded-full px-2 py-0.5 ${r.status === "open" ? "bg-red-100 text-red-800" : r.status === "in_progress" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>{L[r.status]}</span></td>
            <td className="p-2">{canManage && NEXT[r.status] && <button className="text-[#1a6fd8]" onClick={() => mv(r, NEXT[r.status][0])}>{NEXT[r.status][1]}</button>}</td></tr>))}</tbody></table>
        {rows.length === 0 && <p className="p-3 text-gray-400">لا توجد سجلات</p>}</div>
    </div>
  );
}
