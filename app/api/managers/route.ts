import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { toEmail, toPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: "سجّل الدخول أولًا" }, { status: 401 });
  const { data: caller } = await sb.from("profiles").select("role,is_active").eq("id", user.id).single();
  if (caller?.role !== "super_admin" || !caller.is_active) return Response.json({ error: "غير مصرح" }, { status: 403 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return Response.json({ error: "إعداد الخادم غير مكتمل: مفتاح إنشاء الحسابات غير موجود" }, { status: 503 });

  let input: unknown;
  try { input = await request.json(); } catch { return Response.json({ error: "بيانات غير صالحة" }, { status: 400 }); }
  if (!input || typeof input !== "object") return Response.json({ error: "بيانات غير صالحة" }, { status: 400 });
  const body = input as Record<string, unknown>;
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const branch = typeof body.branch === "string" ? body.branch : "";
  if (!/^[a-z0-9_]{3,32}$/.test(username) || name.length < 2 || password.length < 8 || password.length > 72 ||
      !/^[0-9a-f-]{36}$/i.test(branch)) return Response.json({ error: "أدخل اسمًا وكود مستخدم إنجليزيًا وكلمة مرور من 8 أحرف على الأقل وفرعًا صحيحًا" }, { status: 400 });
  const { data: b } = await sb.from("branches").select("id").eq("id", branch).eq("is_active", true).is("deleted_at", null).maybeSingle();
  if (!b) return Response.json({ error: "الفرع غير متاح" }, { status: 400 });
  const { data: assigned } = await sb.from("profiles").select("id").eq("role", "branch_manager").eq("branch_id", branch).maybeSingle();
  if (assigned) return Response.json({ error: "يوجد مدير لهذا الفرع. غيّر تعيينه أولًا" }, { status: 409 });

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: toEmail(username), password: toPassword(password), email_confirm: true,
  });
  if (authError || !created.user) return Response.json({ error: authError?.message ?? "فشل إنشاء الحساب" }, { status: 400 });
  const id = created.user.id;
  const { error: profileError } = await admin.from("profiles").insert({ id, username, full_name: name, role: "branch_manager" });
  if (profileError) { await admin.auth.admin.deleteUser(id); return Response.json({ error: profileError.message }, { status: 400 }); }
  const { error: assignmentError } = await sb.rpc("assign_branch_manager", { b: branch, u: id });
  if (assignmentError) { await admin.auth.admin.deleteUser(id); return Response.json({ error: assignmentError.message }, { status: 400 }); }
  return Response.json({ id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ error: 'سجّل الدخول أولًا' }, { status: 401 });
  const { data: caller } = await sb.from('profiles').select('role,is_active').eq('id', user.id).single();
  if (caller?.role !== 'super_admin' || !caller.is_active) return Response.json({ error: 'غير مصرح' }, { status: 403 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return Response.json({ error: 'إعداد إدارة الحسابات غير مكتمل' }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: 'بيانات غير صحيحة' }, { status: 400 }); }
  if (!body || typeof body.id !== 'string') return Response.json({ error: 'حدد الحساب' }, { status: 400 });
  const { data: target } = await sb.from('profiles').select('id,role').eq('id', body.id).maybeSingle();
  if (target?.role !== 'branch_manager') return Response.json({ error: 'الحساب ليس مدير فرع' }, { status: 400 });
  if (typeof body.password === 'string') {
    if (body.password.length < 8 || body.password.length > 72) return Response.json({ error: 'كلمة المرور من 8 إلى 72 حرفًا' }, { status: 400 });
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.auth.admin.updateUserById(target.id, { password: toPassword(body.password) });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    await sb.rpc('log_export', { report: 'manager_password_reset', params: { manager_id: target.id } });
  } else if (typeof body.active === 'boolean') {
    const { error } = await sb.from('profiles').update({ is_active: body.active }).eq('id', target.id);
    if (error) return Response.json({ error: error.message }, { status: 400 });
  } else return Response.json({ error: 'لم تحدد التعديل' }, { status: 400 });
  return Response.json({ ok: true });
}
