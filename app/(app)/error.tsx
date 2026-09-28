'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
 return <div className="panel space-y-4"><h2 className="text-xl font-bold">تعذر تحميل البيانات</h2><p className="text-sm text-slate-500">تحقق من الاتصال وإعداد قاعدة البيانات، ثم أعد المحاولة.</p><button className="primary-btn" onClick={reset}>إعادة المحاولة</button></div>;
}
