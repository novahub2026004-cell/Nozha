'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { Weights, validWeights } from '@/lib/evaluation';
import { btn, inp, card } from '@/components/ui';
export default function Settings({ value, userId }: { value: Weights; userId: string }) {
  const [w,setW]=useState(value),[message,setMessage]=useState(''),[busy,setBusy]=useState(false); const router=useRouter();
  async function save(){ if(!validWeights(w)) return setMessage('مجموع الأوزان يجب أن يكون 100% وكل وزن بين 0 و100'); setBusy(true);
    const {error}=await supabaseBrowser().from('settings').upsert({key:'evaluation_weights',value:w,updated_by:userId,updated_at:new Date().toISOString()});
    setBusy(false);setMessage(error ? error.message : 'تم حفظ أوزان التقييم');if(!error)router.refresh(); }
  return <div className={`${card} max-w-2xl space-y-5`}><h2 className="text-xl font-extrabold">أوزان التقييم الشامل</h2><p className="text-sm leading-7 text-slate-500">حدد أهمية الروتين والحضور والجودة في النتيجة النهائية. تُطبّق هذه الأوزان على جميع الفروع، ويجب أن يكون مجموعها 100%.</p>
    {(Object.entries({routine:'الروتين اليومي',attendance:'الحضور',quality:'الجودة'}) as [keyof Weights,string][]).map(([key,label])=><label key={key} className="flex items-center justify-between gap-3 text-sm font-bold">{label}<span><input type="number" min="0" max="100" step="1" className={`${inp} w-24`} value={w[key]} onChange={e=>setW({...w,[key]:Number(e.target.value)})}/> %</span></label>)}
    <p className="text-sm">المجموع: {w.routine+w.attendance+w.quality}%</p><button disabled={busy} onClick={save} className={btn}>حفظ الإعدادات</button><p role="status" className="text-sm">{message}</p>
  </div>;
}
