import OperationsDashboard from '@/components/OperationsDashboard';
import Nav from '@/components/Nav';
import { DEFAULT_WEIGHTS, BranchMetrics } from '@/lib/evaluation';
export default function Preview() {
  const rows: BranchMetrics[] = Array.from({length:9},(_,i)=>({
    id:`demo-${i+1}`,name:`الفرع ${String(i+1).padStart(2,'0')}`,code:`NZ-${String(i+1).padStart(2,'0')}`,manager_name:`مدير الفرع ${i+1}`,
    employees:6,recorded:i===8?4:6,present:[6,5,6,6,5,6,5,6,4][i],absent:0,late:i===1?1:0,
    expected_reports:1,submitted_reports:i<6?1:0,total_items:10,done_items:i<6?[10,8,9,10,7,10][i]:0,
    quality_pct:[95,88,92,96,78,94,86,88,83][i],quality_date:'2026-09-28',
    open_tasks:[1,2,2,1,2,1,2,1,2][i],waiting_tasks:i<3?1:0,overdue_tasks:i===4?2:0,open_complaints:i===1?1:0,open_maintenance:i===4?1:0,
  }));
  return <><Nav title="نزهة" subtitle="المدير العام · جميع الفروع" userId="preview" role="super_admin" preview /><main className="app-main"><OperationsDashboard rows={rows} weights={DEFAULT_WEIGHTS} date="2026-09-28" name="المدير العام" preview /></main></>;
}
