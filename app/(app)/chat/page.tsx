import { ctx } from "@/lib/session";
import Chat from "./client";
export default async function Page({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const { sb, user } = await ctx();
  const { room } = await searchParams;
  const [rooms, people] = await Promise.all([
    sb.from("chat_rooms").select("id,type,name,chat_members(user_id,profiles(full_name))"),
    sb.from("profiles").select("id,full_name,role").neq("id", user.id).neq("role", "employee"),
  ]);
  return <Chat rooms={rooms.data ?? []} people={people.data ?? []} userId={user.id} initialRoom={room} />;
}
