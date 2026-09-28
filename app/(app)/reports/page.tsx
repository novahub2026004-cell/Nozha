import { ctx } from "@/lib/session";
import Client from "./client";
export default async function Page() {
  const { sb } = await ctx();
  const { data } = await sb.from("branches").select("id,name").order("code");
  return <Client branches={data ?? []} />;
}
