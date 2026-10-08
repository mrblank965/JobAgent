import { KeywordList } from "@/components/analysis/KeywordList";
import { MatchScore } from "@/components/analysis/MatchScore";
import { SuggestionList } from "@/components/analysis/SuggestionList";
import { JDInput } from "@/components/jd/JDInput";

export default function MatchPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-sm font-semibold text-blue-600">成员 C + D + E · 联调页面</p>
      <h1 className="mt-2 text-3xl font-bold">岗位匹配</h1>
      <p className="mt-3 text-slate-600">当前结果为模拟数据，用于让三个模块在真实接口完成前并行开发。</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <JDInput />
        <div className="space-y-5">
          <MatchScore score={72} />
          <div className="grid gap-4 sm:grid-cols-3">
            <KeywordList title="已匹配" items={["Python", "Excel"]} />
            <KeywordList title="部分匹配" items={["SQL"]} tone="warning" />
            <KeywordList title="待补充" items={["Tableau"]} tone="danger" />
          </div>
          <SuggestionList suggestions={["在项目经历中补充 SQL 的具体使用场景。", "如果确有相关经历，可补充数据可视化工具的实践证据。"]} />
        </div>
      </div>
    </main>
  );
}
