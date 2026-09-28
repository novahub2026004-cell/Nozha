// Run ONCE on an empty project:  npm run seed
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const pw = (p: string) => p + "#nzh";
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const ok = (r: { error: any }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); };

async function mkUser(username: string, full_name: string, role: string, branch_id?: string) {
  const { data, error } = await sb.auth.admin.createUser({ email: `${username}@nozha.local`, password: pw("1234"), email_confirm: true });
  if (error) throw error;
  ok(await sb.from("profiles").insert({ id: data.user.id, username, full_name, role, branch_id }), "profile " + username);
  return data.user.id;
}

async function main() {
  const admin = await mkUser("1234", "المدير العام", "super_admin");

  const branchNames = ["فرع النزهة", "فرع مصر الجديدة", "فرع مدينة نصر", "فرع التجمع", "فرع المعادي", "فرع الدقي", "فرع الشيخ زايد", "فرع 6 أكتوبر", "فرع الإسكندرية"];
  const { data: branches, error } = await sb.from("branches")
    .insert(branchNames.map((name, i) => ({ code: `NZ-${String(i + 1).padStart(2, "0")}`, name, city: i === 8 ? "الإسكندرية" : "القاهرة", address: name + " - شارع رئيسي" }))).select();
  if (error) throw error;

  await sb.from("branches").update({ is_24h: true }).eq("code", "NZ-03");
  const { data: depts } = await sb.from("departments").insert(["المبيعات", "المخبوزات", "اللحوم", "الخضروات", "المخازن"].map((name) => ({ name }))).select();

  const managers: string[] = [];
  for (let i = 0; i < 9; i++) managers.push(await mkUser(`manager${i + 1}`, `مدير ${branchNames[i]}`, "branch_manager", branches![i].id));

  // Employees + salaries
  const first = ["أحمد", "محمد", "محمود", "مصطفى", "حسن", "علي", "إبراهيم", "خالد", "سارة", "منى", "هدى", "نور"];
  const last = ["السيد", "عبدالله", "حسين", "فتحي", "سالم", "جمال", "رمضان", "عثمان"];
  const positions = ["كاشير", "بائع", "أمين مخزن", "عامل مخبوزات", "جزار", "عامل خضروات", "عامل نظافة"];
  const emps: any[] = [];
  for (const b of branches!) for (let i = 0; i < 6; i++) emps.push({
    branch_id: b.id, department_id: pick(depts!).id, full_name: `${pick(first)} ${pick(last)}`,
    phone: "010" + Math.floor(10000000 + Math.random() * 89999999), position: pick(positions),
    hire_date: `202${Math.floor(Math.random() * 5)}-0${1 + Math.floor(Math.random() * 9)}-15`,
  });
  const { data: empRows, error: e2 } = await sb.from("employees").insert(emps).select();
  if (e2) throw e2;
  ok(await sb.from("employee_salaries").insert(empRows!.map((e) => ({ employee_id: e.id, salary: 4000 + Math.floor(Math.random() * 60) * 100 }))), "salaries");

  // Attendance: today + previous 6 days
  const att: any[] = [];
  for (let d = 0; d < 7; d++) {
    const date = new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
    for (const e of empRows!) {
      const r = Math.random();
      const status = r < 0.8 ? "present" : r < 0.9 ? "late" : r < 0.96 ? "absent" : "leave";
      att.push({ employee_id: e.id, branch_id: e.branch_id, work_date: date, status,
        check_in: status === "absent" || status === "leave" ? null : `${date}T${status === "late" ? "09:35" : "08:55"}:00+02:00`,
        check_out: status === "absent" || status === "leave" ? null : `${date}T17:05:00+02:00`,
        recorded_by: managers[branches!.findIndex((b) => b.id === e.branch_id)] });
    }
  }
  ok(await sb.from("attendance").insert(att), "attendance");

  // Daily checklist
  const { data: tpl } = await sb.from("checklist_templates").insert({ name: "الروتين اليومي والتنظيف" }).select().single();
  const sections: Record<string, string[]> = {
    "النظافة": ["تنظيف الأرضيات", "تنظيف الأرفف", "تنظيف دورات المياه"],
    "الثلاجات": ["قياس درجة الحرارة", "ترتيب المنتجات"],
    "الخضروات": ["فرز الخضروات الطازجة", "إزالة التالف"],
    "المخبوزات": ["فحص طازجية المخبوزات"], "قسم اللحوم": ["نظافة الأدوات", "حرارة العرض"], "المخازن": ["ترتيب المخزن", "مراجعة تواريخ الصلاحية"],
  };
  const items: any[] = []; let so = 0;
  for (const [section, labels] of Object.entries(sections)) for (const label of labels) items.push({ template_id: tpl!.id, section, label, sort_order: so++ });
  const { data: itemRows } = await sb.from("checklist_items").insert(items).select();
  for (let i = 0; i < 6; i++) {
    const { data: rep } = await sb.from("daily_reports").insert({ template_id: tpl!.id, branch_id: branches![i].id, submitted_by: managers[i] }).select().single();
    await sb.from("daily_report_items").insert(itemRows!.map((it) => ({ report_id: rep!.id, item_id: it.id, is_done: Math.random() > 0.15 })));
  }

  // Quality form + submissions (score is auto-calculated by trigger)
  const { data: form } = await sb.from("quality_forms").insert({ name: "تقييم جودة الفرع", created_by: admin }).select().single();
  const qs: any[] = [];
  for (const [i, title] of ["النظافة العامة", "جودة المنتجات", "خدمة العملاء"].entries()) {
    const { data: s } = await sb.from("quality_sections").insert({ form_id: form!.id, title, sort_order: i }).select().single();
    for (let k = 1; k <= 3; k++) qs.push((await sb.from("quality_questions").insert({ section_id: s!.id, text: `${title} - بند ${k}`, max_score: 5, sort_order: k }).select().single()).data);
  }
  for (let i = 0; i < 9; i++) {
    const { data: sub } = await sb.from("quality_submissions").insert({ form_id: form!.id, branch_id: branches![i].id, submitted_by: managers[i] }).select().single();
    await sb.from("quality_answers").insert(qs.map((q) => ({ submission_id: sub!.id, question_id: q.id, score: 3 + Math.floor(Math.random() * 3) })));
  }

  // Tasks / complaints / maintenance
  const statuses = ["created", "received", "in_progress", "waiting_review", "approved", "closed"];
  const titles = ["جرد المخزن الأسبوعي", "تجديد لافتات العروض", "مراجعة تواريخ الصلاحية", "تجهيز الفرع للموسم", "تحديث أسعار الخضروات"];
  ok(await sb.from("tasks").insert(Array.from({ length: 14 }, (_, i) => ({
    title: pick(titles), description: "مهمة تجريبية", priority: pick(["low", "medium", "high", "urgent"]),
    status: statuses[i % statuses.length], branch_id: branches![i % 9].id, assigned_to: managers[i % 9], created_by: admin,
    due_date: new Date(Date.now() + (i - 4) * 864e5).toISOString() }))), "tasks");
  ok(await sb.from("complaints").insert([0, 2, 4, 5].map((i) => ({ branch_id: branches![i].id, title: "شكوى عميل بخصوص التأخير", source: "customer", status: i % 2 ? "in_progress" : "open", created_by: managers[i] }))), "complaints");
  ok(await sb.from("maintenance_requests").insert([1, 3, 6].map((i) => ({ branch_id: branches![i].id, title: "عطل في ثلاجة العرض", priority: "high", status: "open", created_by: managers[i] }))), "maintenance");

  console.log("Seed done. Login: 1234 / 1234  or  manager1..manager9 / 1234");
}
main().catch((e) => { console.error(e); process.exit(1); });
