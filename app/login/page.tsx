"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toEmail, toPassword } from "@/lib/auth";

export default function Login() {
  const router = useRouter();
  const [u, setU] = useState(""); const [p, setP] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    const sb = supabaseBrowser();
    const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(u), password: toPassword(p) });
    setBusy(false);
    if (error) return setErr("اسم المستخدم أو كلمة المرور غير صحيحة");
    const { data: profile } = await sb.from("profiles").select("is_active").eq("id", data.user!.id).maybeSingle();
    if (!profile?.is_active) { await sb.auth.signOut(); return setErr("الحساب غير مفعل. تواصل مع المدير العام"); }
    router.replace("/"); router.refresh();
  };
  const input = "w-full rounded-xl border border-[#dce5ee] bg-[#f9fbfd] px-4 py-3 text-sm outline-none transition focus:border-[#087f83] focus:ring-2 focus:ring-[#087f83]/15";
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_15%_20%,#d9f1ef,transparent_35%),#f4f7fa] p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-[28px] border border-[#e5ebf0] bg-white p-7 shadow-[0_25px_70px_rgba(16,44,68,0.09)] sm:p-9">
        <div className="text-center">
          <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[#102c44] text-2xl font-extrabold text-white">ن</span>
          <h1 className="text-2xl font-extrabold text-[#152b43]">نظام إدارة فروع نزهة</h1>
          <p className="mt-1 text-sm text-[#718398]">سجّل الدخول لمتابعة أعمال الفروع</p>
        </div>
        <label className="block text-sm font-semibold">اسم المستخدم<input className={`${input} mt-1.5`} placeholder="اسم المستخدم" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" required /></label>
        <label className="block text-sm font-semibold">كلمة المرور<input className={`${input} mt-1.5`} type="password" placeholder="كلمة المرور" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required /></label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-[#087f83] py-3 font-bold text-white transition hover:bg-[#076d70] disabled:opacity-60">
          {busy ? "جارٍ الدخول..." : "دخول"}
        </button>
        {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && <div className="rounded-xl bg-gray-100 p-3 text-xs text-gray-600">
          <p className="mb-1 font-semibold text-[#1a6fd8]">حسابات النسخة التجريبية</p>
          <p>المدير العام: 1234 / 1234</p>
          <p>مديرو الفروع: manager1 ... manager9 / 1234</p>
        </div>}
      </form>
    </div>
  );
}
