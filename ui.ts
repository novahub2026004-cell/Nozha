export const inp = "field";
export const btn = "primary-btn";
export const card = "panel";
export const hhmm = (ts?: string | null) =>
  ts ? new Date(ts).toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }) : "";
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
