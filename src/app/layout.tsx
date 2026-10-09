import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/Sidebar";
import { StoreProvider } from "@/lib/store";
import "./globals.css";
import "@/styles/dashboard.css";
import "@/styles/results.css";
import "@/styles/resume.css";

export const metadata: Metadata = {
  title: "JobAgent · 求职一条龙工作台",
  description: "上传简历和岗位 JD，获得匹配分析与简历修改建议。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body>
        <StoreProvider>
          <div className="app">
            <Sidebar />
            <main className="main">{children}</main>
          </div>
        </StoreProvider>
      </body>
    </html>
  );
}
