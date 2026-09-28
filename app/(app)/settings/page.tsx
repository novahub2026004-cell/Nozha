import { redirect } from 'next/navigation';
import { ctx } from '@/lib/session';
import { DEFAULT_WEIGHTS, validWeights } from '@/lib/evaluation';
import Settings from './settings';
export default async function Page() {
  const { sb, admin, user } = await ctx(); if (!admin) redirect('/');
  const { data } = await sb.from('settings').select('value').eq('key','evaluation_weights').maybeSingle();
  return <Settings value={validWeights(data?.value) ? data.value : DEFAULT_WEIGHTS} userId={user.id} />;
}
