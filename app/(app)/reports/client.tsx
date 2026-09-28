"use client";
import { useState } from "react";
import { card, inp, btn } from "@/components/ui";
import { REPORTS } from "@/lib/reports";

export default function Client({ branches }: { branches: { id: string; name: string }[] }) {
  const d = new Date().toISOString().slice(0, 10), m = d.slice(0, 8) + "01";
  const [f, setF] = useState({ type: "attendance", from: m, to: d, branch: "" });
  const qs = new URLSearchParams({ from: f.from, to: f.to, ...(f.branch ? { branch: f.branch } : {}) }).toString();
  const preset = (days: number) => setF({ ...f, from: new Date(Date.now() - days * 864e5).toISOString().slice(0, 10), to: d });
  return (
    <div className={`${card} space-y-4`}>
      <h2 className="font-bold">التقارير والتصدير</h2>
      <div className="flex flex-wrap items-center gap-2">
        <select className={inp} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(REPORTS).map(([k, r]) => <option key={k} value={k}>{r.title}</option>)}</select>
        <select className={inp} value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}><option value="">كل الفروع</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <input type="date" className={inp} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <input type="date" className={inp} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => preset(0)}>يومي</button>
        <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => preset(6)}>أسبوعي</button>
        <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => preset(29)}>شهري</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a className={btn} href={`/api/reports/${f.type}?${qs}`}>⬇ تصدير Excel</a>
        <a className={`${btn} bg-red-600`} href={`/reports/print?type=${f.type}&${qs}`} target="_blank">⬇ تصدير PDF</a>
      </div>
      <p className="text-xs text-gray-400">PDF: تفتح صفحة التقرير وتُحفظ بصيغة PDF من نافذة الطباعة (اختر "حفظ كـ PDF") - هذا يضمن ظهور العربية بشكل سليم.</p>
    </div>
  );
}
