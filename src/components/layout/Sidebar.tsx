"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/", icon: "🏠", label: "工作台" },
  { href: "/resume", icon: "🪶", label: "简历解析" },
  { href: "/analysis", icon: "🧭", label: "岗位分析" },
  { href: "/jd", icon: "🔎", label: "JD 拆解器" },
  { href: "/match", icon: "⚖️", label: "岗位匹配" },
  { href: "/optimize", icon: "📝", label: "简历定制" },
  { href: "/board", icon: "📮", label: "投递看板" },
  { href: "/interview", icon: "🎤", label: "面试陪练" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="side">
      <div className="brand">
        JobAgent
        <small>求职一条龙工作台</small>
      </div>

      <nav aria-label="主要导航">
        {navigation.map((item, index) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="ni-num">{index === 0 ? "" : String(index).padStart(2, "0")}</span>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="side-foot">
        <span className="dot-live" />
        数据仅存于本机页面内存
        <br />
        无后端 · 无账号 · 刷新即清空
      </div>
    </aside>
  );
}
