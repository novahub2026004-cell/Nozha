"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

// One realtime subscription for the whole app shell. RLS filters events server-side, so a branch
// manager only receives changes for his own branch. Server components re-render via router.refresh().
const TABLES = ["tasks", "attendance", "employees", "branches", "complaints", "maintenance_requests",
  "daily_reports", "quality_submissions", "activity_log", "daily_report_items", "checklist_items", "checklist_templates", "settings"];

export default function LiveRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const sb = supabaseBrowser();
    let timer: ReturnType<typeof setTimeout>;
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 400); };

    const data = sb.channel("live-data");
    TABLES.forEach((table) => data.on("postgres_changes", { event: "*", schema: "public", table }, bump));
    data.subscribe();

    // Online status (Presence). The chat module reads presence.presenceState() for the green dot.
    const presence = sb.channel("presence:online", { config: { presence: { key: userId } } });
    presence.subscribe(async (s) => { if (s === "SUBSCRIBED") await presence.track({ at: Date.now() }); });
    const beat = setInterval(() => sb.rpc("touch_presence"), 60_000);

    return () => { clearTimeout(timer); clearInterval(beat); sb.removeChannel(data); sb.removeChannel(presence); };
  }, [userId, router]);
  return null;
}
