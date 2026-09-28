"use client";
import { useEffect } from "react";
export default function PrintNow() {
  useEffect(() => { const t = setTimeout(() => window.print(), 600); return () => clearTimeout(t); }, []);
  return <button className="no-print mt-4 rounded-lg bg-[#1a6fd8] px-4 py-2 text-white" onClick={() => window.print()}>طباعة / حفظ PDF</button>;
}
