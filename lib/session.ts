import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
export async function ctx() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (!profile?.is_active) redirect("/login?disabled=1");
  return { sb, user, profile: profile!, admin: profile?.role === "super_admin" };
}
