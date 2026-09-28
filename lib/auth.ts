// The UI logs in with a username (e.g. "1234", "manager1"). Supabase Auth needs email + 6+ char password,
// so we map the username to an internal email and pad the password. The login screen stays unchanged.
export const toEmail = (username: string) => `${username.trim().toLowerCase()}@nozha.local`;
export const toPassword = (pw: string) => `${pw}#nzh`;
export const ROLE_LABEL: Record<string, string> = {
  super_admin: "المدير العام", area_manager: "مدير منطقة", branch_manager: "مدير الفرع",
  quality_inspector: "مفتش جودة", employee: "موظف",
};
