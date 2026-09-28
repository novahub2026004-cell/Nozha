import { ctx } from '@/lib/session';
import { today, inp, btn } from '@/components/ui';
import { getOperations } from '@/lib/operations';
import OperationsDashboard from '@/components/OperationsDashboard';
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { sb } = await ctx(); const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date! : today();
  const { rows, weights } = await getOperations(sb, date);
  return <div className="space-y-5"><form className="flex flex-wrap items-center gap-2"><label className="text-sm">تاريخ المتابعة <input aria-label="تاريخ المتابعة" type="date" name="date" defaultValue={date} max={today()} className={inp} /></label><button className={btn}>عرض</button></form><OperationsDashboard rows={rows} weights={weights} date={date} evaluation /></div>;
}
