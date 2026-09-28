import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";


export const metadata: Metadata = {
  title: "نظام إدارة فروع نزهة",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "نزهة" },
};
export const viewport: Viewport = { themeColor: "#102c44" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="font-cairo min-h-screen">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
