import { ctx } from "@/lib/session";
import Client from "./client";
export default async function Page() {
  const { sb, admin, profile, user } = await ctx();
  const [d, c, b] = await Promise.all([
    sb.from("documents").select("id,title,storage_path,size_bytes,created_at,category_id,branches(name),document_categories(name)").order("created_at", { ascending: false }),
    sb.from("document_categories").select("id,name").order("name"),
    sb.from("branches").select("id,name").order("code"),
  ]);
  return <Client docs={d.data ?? []} cats={c.data ?? []} branches={b.data ?? []} admin={admin} myBranch={profile.branch_id} userId={user.id} />;
}
