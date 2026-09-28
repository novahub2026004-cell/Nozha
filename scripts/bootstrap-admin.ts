// Run once after migrations on a fresh production Supabase project.
import { createClient } from "@supabase/supabase-js";
import { toEmail, toPassword } from "../lib/auth";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const username = process.env.INITIAL_ADMIN_USERNAME?.trim().toLowerCase();
const password = process.env.INITIAL_ADMIN_PASSWORD;
const name = process.env.INITIAL_ADMIN_NAME?.trim();
if (!url || !key || !username || !password || !name || !/^[a-z0-9_]{3,32}$/.test(username) || password.length < 12)
  throw new Error("Set Supabase URL, service role key, INITIAL_ADMIN_USERNAME, INITIAL_ADMIN_PASSWORD (12+ chars), and INITIAL_ADMIN_NAME in .env.local");

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: existing, error: readError } = await sb.from("profiles").select("id").eq("role", "super_admin").limit(1);
if (readError) throw readError;
if (existing?.length) throw new Error("An admin already exists. Bootstrap is only for a new project.");
const { data, error } = await sb.auth.admin.createUser({ email: toEmail(username), password: toPassword(password), email_confirm: true });
if (error || !data.user) throw error ?? new Error("Could not create admin");
const { error: profileError } = await sb.from("profiles").insert({ id: data.user.id, username, full_name: name, role: "super_admin" });
if (profileError) { await sb.auth.admin.deleteUser(data.user.id); throw profileError; }
console.log(`Administrator created: ${username}. Add the real branches and manager accounts in the app.`);
