import Link from 'next/link';
import { Building2, Users, ClipboardCheck, CircleAlert, ArrowUpLeft, CheckCircle2, Clock3, ListTodo, Activity } from 'lucide-react';
import { BranchMetrics, Weights, evaluateBranch } from '@/lib/evaluation';
export default function OperationsDashboard({ rows, weights, date, name = 'المدير العام', preview = false, evaluation = false }: {
  rows: BranchMetrics[]; weights: Weights; date: string; name?: string; preview?: boolean; evaluation?: boolean;
}) {
  const sum = (key: keyof BranchMetrics) => rows.reduce((n, r) => n + Number(r[key] || 0), 0);
  const expected = sum('expected_reports'), submitted = sum('submitted_reports');
  const waiting = sum('waiting_tasks'), overdue = sum('overdue_tasks');
  const href = (path: string) => preview ? '#evaluation' : path;
  const metrics = [
    { label: 'الفروع المتاحة', value: rows.length, sub: 'حساب مستقل لكل مدير فرع', Icon: Building2, color: '#2563eb', bg: '#edf3ff' },
    { label: 'حضور الموظفين', value: `${sum('present')} / ${sum('employees')}`, sub: `${sum('recorded')} سجل حضور اليوم`, Icon: Users, color: '#11866f', bg: '#e8f7f2' },
    { label: 'تقارير الروتين', value: `${submitted} / ${expected}`, sub: `${Math.max(0, expected - submitted)} تقرير بانتظار التسليم`, Icon: ClipboardCheck, color: '#8a5dd3', bg: '#f3edff' },
    { label: 'مهام تحتاج متابعة', value: overdue + waiting, sub: `${waiting} للمراجعة · ${overdue} متأخرة`, Icon: CircleAlert, color: '#bf7b23', bg: '#fff5e3' },
  ];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="mb-1 flex items-center gap-2 text-xs font-bold text-[#2563eb]"><Activity size={15} /> متابعة العمليات</div>
        <h2 className="text-2xl font-extrabold tracking-tight text-[#172d49] sm:text-[28px]">{evaluation ? 'التقييم الشامل للفروع' : `أهلًا، ${name}`}</h2>
        <p className="mt-1 text-xs text-[#7b8ba0]">{new Date(`${date}T12:00:00+03:00`).toLocaleDateString('ar-EG', { dateStyle: 'full', timeZone: 'Africa/Cairo' })} · {preview ? 'معاينة ببيانات توضيحية' : 'كل ما تحتاج متابعته في مكان واحد'}</p></div>
      <Link href={href('/reports')} className="primary-btn flex items-center gap-2 text-xs">عرض التقارير <ArrowUpLeft size={16} /></Link>
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map(({ label, value, sub, Icon, color, bg }) => <section key={label} className="panel !p-4 sm:!p-5">
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold text-[#70839b]">{label}</span><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ color, background: bg }}><Icon size={18} /></span></div>
      <p dir="ltr" className="my-2 text-right text-2xl font-extrabold tabular-nums text-[#172d49] sm:text-3xl">{value}</p><p className="text-[10px] text-[#8493a7]">{sub}</p>
    </section>)}</div>
    {!evaluation && <section className="panel">
      <div className="mb-5 flex items-center justify-between gap-3"><div><h3 className="font-extrabold">نبض الفروع</h3><p className="mt-1 text-[11px] text-[#8493a7]">الحضور والروتين والتقييم لكل فرع</p></div><span className="rounded-full bg-[#edf3ff] px-3 py-1 text-[11px] font-bold text-[#2563eb]">{rows.length} فروع</span></div>
      {rows.length === 0 && <p className="py-8 text-center text-sm text-[#70839b]">أضف الفروع والحسابات للبدء في المتابعة.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map(r => {
        const e = evaluateBranch(r, weights); const complete = r.expected_reports > 0 && r.expected_reports === r.submitted_reports;
        return <Link key={r.id} href={href(`/daily?branch=${r.id}&date=${date}`)} className="rounded-2xl border border-[#e5ecf5] bg-[#fcfdff] p-4 transition hover:border-[#97b8ff] hover:bg-[#f8fbff]">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-[#e5ecf5] bg-white text-[#6983a8]"><Building2 size={18}/></span><div className="min-w-0 flex-1"><h4 className="text-sm font-extrabold">{r.name}</h4><p className="mt-0.5 truncate text-[10px] text-[#8a99ac]">{r.manager_name ?? 'لم يُعيّن مدير بعد'}</p></div><span className={`text-lg font-extrabold ${e.score === null ? 'text-[#a3b0bf]' : e.score >= 75 ? 'text-[#11866f]' : 'text-[#bf7b23]'}`}>{e.score === null ? '—' : `${e.score}%`}</span></div>
          <div className="mb-2 mt-4 flex justify-between text-[10px]"><span className="text-[#70839b]">إنجاز بنود الروتين</span><span className="font-bold text-[#476582]">{e.routine === null ? 'غير متاح' : `${e.routine}%`}</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#e9eff7]"><div className={`h-full rounded-full ${complete ? 'bg-[#29ad93]' : 'bg-[#e6ab52]'}`} style={{ width: `${e.routine ?? 0}%` }} /></div>
          <div className="mt-4 flex items-center justify-between gap-1 border-t border-[#e9eff7] pt-3 text-[10px]"><span className="flex items-center gap-1 text-[#70839b]"><Users size={12} /> <bdi>{r.present}/{r.employees}</bdi></span><span className="flex items-center gap-1 text-[#70839b]"><ListTodo size={12}/>{r.open_tasks} مهام</span><span className={`flex items-center gap-1 font-semibold ${complete ? 'text-[#11866f]' : 'text-[#bf7b23]'}`}>{complete ? <CheckCircle2 size={12}/> : <Clock3 size={12}/>} {complete ? 'تم التسليم' : 'بانتظار التسليم'}</span></div>
        </Link>;
      })}</div>
    </section>}
    <section className="panel" id="evaluation"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-extrabold">التقييم التشغيلي الشامل</h3><p className="mt-1 text-[11px] text-[#8493a7]">الروتين {weights.routine}% · الحضور {weights.attendance}% · الجودة {weights.quality}%</p></div><Link href={href('/evaluation')} className="text-xs font-bold text-[#2563eb]">تفاصيل التقييم ←</Link></div>
      <div className="overflow-x-auto"><table className="w-full text-right text-xs"><thead><tr>{['الفرع','الروتين','الحضور','الجودة','المهام','بلاغات وصيانة','التقييم'].map(h=><th key={h} className="whitespace-nowrap">{h}</th>)}</tr></thead><tbody>{rows.map(r=>{const e=evaluateBranch(r,weights);return <tr key={r.id} className="border-t border-[#edf1f6]"><td className="whitespace-nowrap font-bold">{r.name}</td><td>{e.routine == null ? '—' : `${e.routine}%`}</td><td>{e.attendance == null ? '—' : `${e.attendance}%`}</td><td><span>{e.quality == null ? '—' : `${e.quality}%`}</span>{r.quality_date && <span className="block whitespace-nowrap text-[10px] text-[#8a99ac]">{r.quality_date}</span>}</td><td>{r.open_tasks}<span className="block whitespace-nowrap text-[10px] text-[#8a99ac]">{r.overdue_tasks} متأخرة</span></td><td>{r.open_complaints+r.open_maintenance}</td><td><span className={`whitespace-nowrap rounded-lg px-2 py-1 text-[10px] font-bold ${e.complete && (e.score ?? 0)>=75 ? 'bg-[#e8f7f2] text-[#11866f]' : 'bg-[#fff5e3] text-[#a76c22]'}`}>{e.score == null ? '—' : `${e.score}%`} · {e.label}</span></td></tr>})}</tbody></table></div>
      <p className="mt-3 text-[10px] leading-6 text-[#8493a7]">يُحسب الروتين من البنود المنجزة، والحضور من الموظفين الحاضرين والمتأخرين، والجودة من أحدث تقييم خلال 30 يومًا. عدم اكتمال التسجيل يظهر كتقييم مبدئي. المهام والبلاغات بحالتها الحالية ولا تدخل في النسبة.</p>
    </section>
  </div>;
}
