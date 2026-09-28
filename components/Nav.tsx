"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Building2, Users, Clock3, ClipboardCheck, ListTodo, ShieldCheck, Wrench, MessagesSquare, FolderOpen, ChartNoAxesCombined, History, LogOut, Bell as BellIcon, Settings2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import Bell from "./Bell";

const TABS = [
  ["/", "لوحة المتابعة", LayoutDashboard], ["/evaluation", "التقييم الشامل", ChartNoAxesCombined],
  ["/branches", "الفروع والحسابات", Building2], ["/employees", "الموظفون", Users],
  ["/attendance", "الحضور والانصراف", Clock3], ["/daily", "الروتين اليومي", ClipboardCheck],
  ["/tasks", "المهام والمتابعة", ListTodo], ["/quality", "تقييم الجودة", ShieldCheck],
  ["/complaints", "البلاغات والصيانة", Wrench], ["/chat", "المحادثات", MessagesSquare],
  ["/documents", "الأرشيف", FolderOpen], ["/reports", "التقارير", ChartNoAxesCombined],
] as const;
export default function Nav({ title, subtitle, userId, role, preview = false }: { title: string; subtitle: string; userId: string; role: string; preview?: boolean }) {
  const path = usePathname(), router = useRouter();
  const tabs = role === "super_admin" ? [...TABS, ["/settings", "إعدادات التقييم", Settings2] as const, ["/log", "سجل التعديلات", History] as const] : TABS;
  const activeTitle = preview ? "لوحة المتابعة" : tabs.find(([href]) => href === "/" ? path === "/" : path.startsWith(href))?.[1] ?? "نزهة";
  const active = (href: string) => preview ? href === "/" : href === "/" ? path === "/" : path.startsWith(href);
  const logout = async () => { await supabaseBrowser().auth.signOut(); router.replace("/login"); router.refresh(); };
  const navLinks = tabs.map(([href, label, Icon]) => <Link key={href} href={preview ? (href === "/evaluation" ? "/preview#evaluation" : "/preview") : href}
    aria-current={active(href) ? "page" : undefined}
    className={`flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold transition ${active(href) ? "bg-[#2563eb] text-white shadow-sm" : "text-[#b6c4d9] hover:bg-white/5 hover:text-white"}`}>
    <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
  </Link>);
  return <>
    <aside className="fixed inset-y-0 right-0 z-40 hidden w-[232px] flex-col bg-[#14243d] px-4 py-6 lg:flex">
      <div className="mb-7 flex items-center gap-3 px-2"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#2563eb] text-xl font-extrabold text-white">ن</div><div><div className="text-xl font-extrabold text-white">نزهة</div><div className="text-[10px] text-[#a8bbd5]">إدارة الفروع والعمليات</div></div></div>
      <p className="mb-3 px-3 text-[10px] font-semibold tracking-wide text-[#748baa]">مساحة العمل</p>
      <nav aria-label="القائمة الرئيسية" className="flex flex-1 flex-col gap-1 overflow-y-auto">{navLinks}</nav>
      <div className="mt-4 flex items-center gap-3 border-t border-white/10 px-2 pt-4"><div className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xs font-bold text-white">{role === "super_admin" ? "م ع" : "م ف"}</div><div><p className="text-xs font-bold text-white">{role === "super_admin" ? "المدير العام" : "مدير الفرع"}</p><p className="text-[10px] text-[#a8bbd5]">{role === "super_admin" ? "إشراف ومتابعة جميع الفروع" : "متابعة الفرع المسند إليك"}</p></div></div>
    </aside>
    <header className="border-b border-[#e5ecf5] bg-white lg:mr-[232px]">
      <div className="flex min-h-[76px] items-center justify-between gap-3 px-4 lg:px-8">
        <div><h1 className="text-base font-extrabold text-[#172d49]">{activeTitle}</h1><p className="max-w-[230px] truncate text-[11px] text-[#7b8ba0] sm:max-w-none">{subtitle}</p></div>
        <div className="flex items-center gap-2 text-[#64748b]">
          {preview ? <span className="rounded-lg bg-[#fff5df] px-3 py-2 text-[11px] text-[#94621f]">بيانات توضيحية</span> : <Bell userId={userId} />}
          {!preview && <button onClick={logout} aria-label="تسجيل الخروج" className="rounded-xl border border-[#e5ecf5] p-2.5 hover:bg-gray-50"><LogOut size={18} /></button>}
          {preview && <BellIcon size={19} />}
        </div>
      </div>
      <nav aria-label="قائمة الهاتف" className="flex gap-1 overflow-x-auto bg-[#14243d] px-3 py-2 lg:hidden">{navLinks}</nav>
    </header>
  </>;
}
