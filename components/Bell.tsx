"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import Link from "next/link";
import { Bell as BellIcon } from "lucide-react";
type N = { id: string; title: string; body: string | null; link: string | null; is_read: boolean; created_at: string };
const destination = (link: string | null) => {
  if (!link?.startsWith("/") || link.startsWith("//")) return "/";
  if (link.startsWith("/tasks/")) return "/tasks";
  if (link.startsWith("/chat/")) return `/chat?room=${encodeURIComponent(link.slice(6))}`;
  return ({ "/daily_reports": "/daily", "/quality_submissions": "/quality",
    "/maintenance_requests": "/complaints" } as Record<string, string>)[link] ?? link;
};

export default function Bell({ userId }: { userId: string }) {
  const [sb] = useState(() => supabaseBrowser());
  const [items, setItems] = useState<N[]>([]);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => {
    sb.from("notifications").select("id,title,body,link,is_read,created_at").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(15).then(({ data }) => setItems(data ?? []));
    const ch = sb.channel(`notif-${userId}`).on("postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (p) => { const n = p.new as N; setItems((x) => [n, ...x].slice(0, 15)); setToast(n.title); setTimeout(() => setToast(""), 4000); }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, userId]);
  const unread = items.filter((i) => !i.is_read).length;
  const toggle = async () => {
    setOpen(!open);
    if (!open && unread) { await sb.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false); setItems((x) => x.map((i) => ({ ...i, is_read: true }))); }
  };
  return (
    <div className="relative">
      <button onClick={toggle} aria-label={`الإشعارات${unread ? `، ${unread} غير مقروءة` : ""}`} aria-expanded={open} className="relative rounded-xl border border-[#e5ecf5] bg-white p-2.5 text-[#64748b] hover:bg-gray-50"><BellIcon size={18} />
        {unread > 0 && <i className="absolute -top-2 -left-2 min-w-[18px] rounded-full bg-red-600 text-center text-[11px] not-italic leading-[18px]">{unread}</i>}
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-30 w-72 rounded-xl bg-white p-2 text-sm text-gray-800 shadow-xl">
          {items.length === 0 ? <p className="p-2 text-gray-400">لا توجد إشعارات</p> : items.map((i) => (
            <Link key={i.id} href={destination(i.link)} onClick={() => setOpen(false)}
              className="block border-b p-2 hover:bg-gray-50 last:border-0">{i.title}
              <small className="block text-gray-400">{new Date(i.created_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</small></Link>))}
        </div>
      )}
      {toast && <div className="fixed bottom-4 left-4 z-50 max-w-xs rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-xl">🔔 {toast}</div>}
    </div>
  );
}
