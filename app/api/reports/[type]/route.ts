import ExcelJS from "exceljs";
import { supabaseServer } from "@/lib/supabase/server";
import { getReport } from "@/lib/reports";

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params, u = new URL(req.url), sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const rep = await getReport(sb, type, { from: u.searchParams.get("from") || undefined, to: u.searchParams.get("to") || undefined, branch: u.searchParams.get("branch") || undefined });
  if (!rep) return new Response("not found", { status: 404 });
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet(rep.r.title.slice(0, 30), { views: [{ rightToLeft: true }] });
  ws.addRow(rep.r.cols.map((c) => c[1])).eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A6FD8" } }; });
  rep.rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((c) => { c.width = 20; });
  await sb.rpc("log_export", { report: type, params: Object.fromEntries(u.searchParams), b: u.searchParams.get("branch") || null });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${type}-${new Date().toISOString().slice(0, 10)}.xlsx"` } });
}
