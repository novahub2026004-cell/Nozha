import { ctx } from "@/lib/session";
import Manager from "./manager";

export default async function Page() {
  const { sb, admin, profile } = await ctx();
  const [emps, sal, brs, add, del] = await Promise.all([
    sb.from("employees").select("id,full_name,position,phone,branch_id,hire_date,branches(name)").order("full_name"),
    sb.from("employee_salaries").select("employee_id,salary"),          // RLS: returns rows for Super Admin only
    sb.from("branches").select("id,name"),
    sb.rpc("has_perm", { p: "employees.add" }), sb.rpc("has_perm", { p: "employees.delete" }),
  ]);
  const S = Object.fromEntries((sal.data ?? []).map((s) => [s.employee_id, s.salary]));
  return <Manager rows={(emps.data ?? []).map((e: any) => ({ ...e, branch: e.branches?.name, salary: S[e.id] ?? null }))}
    branches={brs.data ?? []} admin={admin} canAdd={admin || !!add.data} canDelete={admin || !!del.data} defaultBranch={profile.branch_id ?? brs.data?.[0]?.id} />;
}
