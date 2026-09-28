import { ctx } from "@/lib/session";
import Manager from "./manager";

export default async function Page() {
  const { sb, admin } = await ctx();
  const [brs, mgrs] = await Promise.all([
    sb.from("branches").select("*").order("code"),
    sb.from("profiles").select("id,username,full_name,branch_id,is_active").eq("role", "branch_manager"),
  ]);
  return <Manager branches={brs.data ?? []} managers={mgrs.data ?? []} admin={admin} />;
}
