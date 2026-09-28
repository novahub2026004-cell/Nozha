import { ctx } from '@/lib/session';
import { today } from '@/components/ui';
import { getOperations } from '@/lib/operations';
import OperationsDashboard from '@/components/OperationsDashboard';
export default async function Dashboard() {
  const { sb, profile } = await ctx(); const date = today();
  const { rows, weights } = await getOperations(sb, date);
  return <OperationsDashboard rows={rows} weights={weights} date={date} name={profile.full_name} />;
}
