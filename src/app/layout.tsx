import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobAgent｜AI 求职智能助手",
  description: "上传简历和岗位 JD，获得匹配分析与简历修改建议。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">
        <Sidebar />
        <div className="min-h-screen lg:pl-64">{children}</div>
      </body>
    </html>
  );
}
