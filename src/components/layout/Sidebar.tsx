"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/", label: "工作台", short: "首" },
  { href: "/resume", label: "简历解析", short: "简" },
  { href: "/match", label: "岗位匹配", short: "配" },
  { href: "/optimize", label: "简历优化", short: "优" },
  { href: "/interview", label: "模拟面试", short: "面" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-slate-200 bg-slate-950 text-white lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:border-b-0 lg:border-r lg:border-slate-800">
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-500 text-lg font-bold">J</span>
          <div>
            <p className="font-bold">JobAgent</p>
            <p className="text-xs text-slate-400">AI 求职智能助手</p>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="主要导航">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-w-max items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  active ? "bg-blue-600 font-semibold text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-xs font-bold">{item.short}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden px-5 py-5 text-xs leading-5 text-slate-500 lg:block">
          当前为课程项目骨架。各模块将在独立分支完成后合并到 main。
        </div>
      </div>
    </aside>
  );
}
