"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { card, inp, btn } from "@/components/ui";

function Att({ m, sb }: any) {
  const [u, setU] = useState("");
  useEffect(() => { sb.storage.from("chat-files").createSignedUrl(m.file_path, 3600).then(({ data }: any) => setU(data?.signedUrl ?? "")); }, [m.file_path, sb]);
  return m.file_type === "image" ? <a href={u} target="_blank"><img src={u} alt={m.file_name} className="max-h-48 rounded-lg" /></a> : <a href={u} target="_blank" className="underline">📎 {m.file_name}</a>;
}

export default function Chat({ rooms, people, userId, initialRoom }: any) {
  const [sb] = useState(() => supabaseBrowser()), router = useRouter(), end = useRef<HTMLDivElement>(null);
  const [rid, setRid] = useState<string>(rooms.some((r: any) => r.id === initialRoom) ? initialRoom : rooms[0]?.id);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [online, setOnline] = useState<Set<string>>(new Set());
  const other = (r: any) => r.chat_members.find((m: any) => m.user_id !== userId);
  const name = (r: any) => (r.type === "direct" ? other(r)?.profiles?.full_name ?? "محادثة" : r.name ?? "جروب");

  const load = useCallback(async () => {
    if (!rid) return;
    const { data } = await sb.from("messages").select("*,profiles(full_name),message_reads(user_id)").eq("room_id", rid).order("created_at").limit(200);
    setMsgs(data ?? []); await sb.rpc("mark_room_read", { rid });
  }, [rid, sb]);
  useEffect(() => {
    load();
    const ch = sb.channel("room-" + rid)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${rid}` }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads" }, load).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [rid, load, sb]);
  useEffect(() => {
    const p = sb.channel("presence:chat", { config: { presence: { key: userId } } });
    p.on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(p.presenceState())))).subscribe(async (s) => { if (s === "SUBSCRIBED") await p.track({ at: Date.now() }); });
    return () => { sb.removeChannel(p); };
  }, [sb, userId]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const send = async (extra: any = {}) => {
    if (!text.trim() && !extra.file_path) return;
    await sb.from("messages").insert({ room_id: rid, sender_id: userId, body: text.trim() || null, ...extra }); setText("");
  };
  const upload = async (f: File) => {
    const path = `${rid}/${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
    const u = await sb.storage.from("chat-files").upload(path, f, { contentType: f.type });
    if (u.error) return alert(u.error.message);
    await send({ file_path: path, file_name: f.name, file_type: f.type.startsWith("image/") ? "image" : "file" });
  };
  const start = async (id: string) => { if (!id) return; const { data, error } = await sb.rpc("get_or_create_direct_room", { other: id }); if (error) return alert(error.message); setRid(data); router.refresh(); };

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <div className={`${card} space-y-2`}>
        <select className={`${inp} w-full`} value="" onChange={(e) => start(e.target.value)}><option value="">+ محادثة جديدة...</option>{people.map((p: any) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
        {rooms.map((r: any) => (
          <button key={r.id} onClick={() => setRid(r.id)} className={`flex w-full items-center gap-2 rounded-lg p-2 text-right text-sm ${r.id === rid ? "bg-blue-50 font-semibold" : "hover:bg-gray-50"}`}>
            {r.type === "direct" && <i className={`h-2.5 w-2.5 rounded-full ${online.has(other(r)?.user_id) ? "bg-green-500" : "bg-gray-300"}`} />}{r.type === "branch_group" ? "👥 " : ""}{name(r)}</button>))}
      </div>
      <div className={`${card} flex h-[70vh] flex-col`}>
        <div className="flex-1 space-y-2 overflow-y-auto">
          {msgs.map((m) => { const mine = m.sender_id === userId; return (
            <div key={m.id} className={`flex ${mine ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-[#1a6fd8] text-white" : "bg-gray-100"}`}>
                {!mine && <b className="block text-xs opacity-70">{m.profiles?.full_name}</b>}
                {m.file_path && <Att m={m} sb={sb} />}{m.body && <p>{m.body}</p>}
                <small className="block text-[10px] opacity-70">{new Date(m.created_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" })} {mine && (m.message_reads.length ? "✓✓" : "✓")}</small>
              </div></div>); })}
          <div ref={end} />
        </div>
        {rid ? <div className="mt-2 flex gap-2">
          <label className="cursor-pointer rounded-lg border px-3 py-2">📎<input type="file" hidden accept="image/*,.pdf,.xls,.xlsx,.doc,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} /></label>
          <input className={`${inp} flex-1`} placeholder="اكتب رسالة..." value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          <button className={btn} onClick={() => send()}>إرسال</button></div> : <p className="text-gray-400">اختر محادثة أو ابدأ واحدة جديدة</p>}
      </div>
    </div>
  );
}
