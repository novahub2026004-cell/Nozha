export type Weights = { routine: number; attendance: number; quality: number };
export const DEFAULT_WEIGHTS: Weights = { routine: 40, attendance: 30, quality: 30 };
export type BranchMetrics = {
  id: string; name: string; code: string; manager_name: string | null;
  employees: number; recorded: number; present: number; absent: number; late: number;
  expected_reports: number; submitted_reports: number; total_items: number; done_items: number;
  quality_pct: number | null; quality_date: string | null;
  open_tasks: number; waiting_tasks: number; overdue_tasks: number; open_complaints: number; open_maintenance: number;
};
export function validWeights(value: unknown): value is Weights {
  if (!value || typeof value !== 'object') return false;
  const w = value as Weights;
  return [w.routine, w.attendance, w.quality].every(n => Number.isInteger(n) && n >= 0 && n <= 100) && w.routine + w.attendance + w.quality === 100;
}
export function evaluateBranch(row: BranchMetrics, weights: Weights = DEFAULT_WEIGHTS) {
  const routine = row.total_items ? Math.round(row.done_items / row.total_items * 100) : null;
  const attendance = row.employees ? Math.round(row.present / row.employees * 100) : null;
  const quality = row.quality_pct == null ? null : Math.round(Number(row.quality_pct));
  const dimensions = { routine, attendance, quality };
  const missing = (Object.keys(weights) as (keyof Weights)[]).filter(k => weights[k] > 0 && dimensions[k] === null);
  const complete = missing.length === 0 && row.recorded >= row.employees && row.submitted_reports >= row.expected_reports;
  const score = missing.length ? null : Math.round((Object.keys(weights) as (keyof Weights)[]).reduce((sum,k) => sum + (dimensions[k] ?? 0) * weights[k] / 100, 0));
  return { routine, attendance, quality, score, complete,
    label: score === null ? 'بيانات غير كافية' : !complete ? 'تقييم مبدئي' : score >= 90 ? 'ممتاز' : score >= 75 ? 'جيد' : 'يحتاج متابعة' };
}
