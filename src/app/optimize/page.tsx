import { SuggestionList } from "@/components/analysis/SuggestionList";

export default function OptimizePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <p className="text-sm font-semibold text-blue-600">成员 D · 优化模块</p>
      <h1 className="mt-2 text-3xl font-bold">简历优化</h1>
      <p className="mt-3 max-w-2xl leading-7 text-slate-600">这里将根据匹配报告给出原文、修改建议和建议改写，不允许编造用户没有的经历。</p>
      <div className="mt-8">
        <SuggestionList suggestions={["等待接入真实匹配结果。", "每条建议都应说明它对应的 JD 要求和简历证据。"]} />
      </div>
    </main>
  );
}
