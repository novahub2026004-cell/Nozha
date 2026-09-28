import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import LiveRefresh from "@/components/LiveRefresh";
import { supabaseServer } from "@/lib/supabase/server";
import { ROLE_LABEL } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: p } = await sb.from("profiles").select("full_name, role, branches(name)").eq("id", user.id).single();
  const branch = (p?.branches as any)?.name;
  const subtitle = `${p?.full_name ?? ""} - ${ROLE_LABEL[p?.role ?? "employee"]}${branch ? ` - ${branch}` : ""}`;
  return (
    <>
      <LiveRefresh userId={user.id} />
      <Nav title="نظام إدارة فروع نزهة" subtitle={subtitle} userId={user.id} role={p?.role ?? "employee"} />
      <main className="app-main">{children}</main>
    </>
  );
}
