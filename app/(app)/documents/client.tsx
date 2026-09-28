"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { card, inp } from "@/components/ui";

export default function Client({ docs, cats, branches, admin, myBranch, userId }: any) {
  const sb = supabaseBrowser(), router = useRouter();
  const [q, setQ] = useState(""), [cat, setCat] = useState(""), [up, setUp] = useState({ cat: "", branch: myBranch ?? branches[0]?.id }), [err, setErr] = useState("");
  const shown = docs.filter((d: any) => d.title.toLowerCase().includes(q.toLowerCase()) && (!cat || d.category_id === cat));
  const upload = async (f: File) => {
    const path = `${up.branch}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
    const u = await sb.storage.from("branch-docs").upload(path, f, { contentType: f.type });
    if (u.error) return setErr(u.error.message);
    const { error } = await sb.from("documents").insert({ branch_id: up.branch, category_id: up.cat || null, title: f.name, storage_path: path, mime_type: f.type, size_bytes: f.size, uploaded_by: userId });
    setErr(error?.message ?? ""); router.refresh();
  };
  const dl = async (p: string, n: string) => { const { data } = await sb.storage.from("branch-docs").createSignedUrl(p, 60, { download: n }); if (data) window.open(data.signedUrl); };
  const del = async (d: any) => { if (!confirm("حذف الملف؟")) return; await sb.storage.from("branch-docs").remove([d.storage_path]); await sb.from("documents").delete().eq("id", d.id); router.refresh(); };
  const addCat = async () => { const n = prompt("اسم التصنيف (عقود، فواتير، تراخيص...)"); if (n) { await sb.from("document_categories").insert({ name: n }); router.refresh(); } };
  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        {(admin || !myBranch) && <select className={inp} value={up.branch} onChange={(e) => setUp({ ...up, branch: e.target.value })}>{branches.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
        <select className={inp} value={up.cat} onChange={(e) => setUp({ ...up, cat: e.target.value })}><option value="">بدون تصنيف</option>{cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <label className="cursor-pointer rounded-lg bg-[#1a6fd8] px-4 py-2 text-sm font-semibold text-white">+ رفع ملف (PDF / Excel / Word / صورة)
          <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} /></label>
        {admin && <button className="rounded-lg border px-3 py-2 text-sm" onClick={addCat}>+ تصنيف جديد</button>}
        <input className={`${inp} mr-auto w-48`} placeholder="🔍 بحث" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inp} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">كل التصنيفات</option>{cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>
      <div className={`${card} overflow-x-auto`}><table className="w-full text-sm">
        <thead><tr className="text-gray-400">{["الملف", "التصنيف", "الفرع", "الحجم", "التاريخ", ""].map((h) => <th key={h} className="p-2 text-right font-semibold">{h}</th>)}</tr></thead>
        <tbody>{shown.map((d: any) => (<tr key={d.id} className="border-t"><td className="p-2">{d.title}</td><td className="p-2">{d.document_categories?.name ?? "-"}</td><td className="p-2">{d.branches?.name}</td>
          <td className="p-2">{d.size_bytes ? (d.size_bytes / 1024 / 1024).toFixed(2) + " MB" : ""}</td><td className="p-2">{new Date(d.created_at).toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" })}</td>
          <td className="whitespace-nowrap p-2"><button className="text-[#1a6fd8]" onClick={() => dl(d.storage_path, d.title)}>تحميل</button>{admin && <button className="mr-3 text-red-600" onClick={() => del(d)}>حذف</button>}</td></tr>))}</tbody></table>
        {shown.length === 0 && <p className="p-3 text-gray-400">لا توجد ملفات</p>}</div>
    </div>
  );
}
