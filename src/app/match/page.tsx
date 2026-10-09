import { KeywordList } from "@/components/analysis/KeywordList";
import { MatchScore } from "@/components/analysis/MatchScore";
import { SuggestionList } from "@/components/analysis/SuggestionList";
import { JDInput } from "@/components/jd/JDInput";

export default function MatchPage() {
  return (
    <>
      <div className="view-head">
        <h1>🧭 岗位匹配</h1>
        <p>当前结果为模拟数据，用于让三个模块在真实接口完成前并行开发。</p>
      </div>

      <div className="split">
        <JDInput />

        <div>
          <MatchScore score={72} />

          <div className="cards mt12" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            <KeywordList title="已匹配" items={["Python", "Excel"]} />
            <KeywordList title="部分匹配" items={["SQL"]} tone="warning" />
            <KeywordList title="待补充" items={["Tableau"]} tone="danger" />
          </div>

          <div className="mt12">
            <SuggestionList
              suggestions={[
                "在项目经历中补充 SQL 的具体使用场景。",
                "如果确有相关经历，可补充数据可视化工具的实践证据。",
              ]}
            />
          </div>
        </div>
      </div>
    </>
  );
}
