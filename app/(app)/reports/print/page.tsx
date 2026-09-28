import { ctx } from "@/lib/session";
import { getReport } from "@/lib/reports";
import PrintNow from "./print-now";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams, { sb } = await ctx();
  const rep = await getReport(sb, sp.type, { from: sp.from, to: sp.to, branch: sp.branch });
  if (!rep) return <p>تقرير غير موجود</p>;
  await sb.rpc("log_export", { report: sp.type + "_pdf", params: sp, b: sp.branch || null });
  return (
    <div className="bg-white p-6">
      <style>{`@media print{header,nav,.no-print{display:none!important}body{background:#fff}} table{border-collapse:collapse;width:100%;font-size:12px} th,td{border:1px solid #ccc;padding:5px;text-align:right} th{background:#1a6fd8;color:#fff}`}</style>
      <h1 className="text-xl font-bold">نظام إدارة فروع نزهة - {rep.r.title}</h1>
      <p className="mb-3 text-sm text-gray-500">{sp.from} إلى {sp.to} · عدد السجلات {rep.rows.length}</p>
      <table><thead><tr>{rep.r.cols.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
        <tbody>{rep.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>
      <PrintNow />
    </div>
  );
}
