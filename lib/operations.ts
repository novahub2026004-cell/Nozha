import type { SupabaseClient } from '@supabase/supabase-js';
import { BranchMetrics, DEFAULT_WEIGHTS, validWeights } from './evaluation';
export async function getOperations(sb: SupabaseClient, date: string) {
  const [metrics, config] = await Promise.all([
    sb.rpc('branch_daily_metrics', { day: date }),
    sb.from('settings').select('value').eq('key', 'evaluation_weights').maybeSingle(),
  ]);
  if (metrics.error) throw new Error('تعذر تحميل متابعة الفروع. تحقق من تطبيق تحديثات قاعدة البيانات.');
  if (config.error) throw new Error('تعذر تحميل إعدادات التقييم.');
  return { rows: (metrics.data ?? []) as BranchMetrics[], weights: validWeights(config.data?.value) ? config.data.value : DEFAULT_WEIGHTS };
}
