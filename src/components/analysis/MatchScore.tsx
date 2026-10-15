type MatchScoreProps = {
  score: number;
  /** 右上角标签，说明这个数字是什么算法得出的。 */
  label?: string;
  /** 数字上方那行小字，说明这个分数在算什么。 */
  caption?: string;
  /** 色调。默认按"部分匹配"渲染，沿用组件最早的样子。 */
  tone?: "hit" | "partial" | "miss";
};

export function MatchScore({
  score,
  label = "本地启发式",
  caption = "简历与岗位匹配度",
  tone = "partial",
}: MatchScoreProps) {
  const safeScore = Math.max(0, Math.min(100, score));

  return (
    <div className="card">
      <div className="spread">
        <div>
          <div className="tiny">{caption}</div>
          <div className="bignum">
            {safeScore}
            <small>%</small>
          </div>
        </div>
        <span className={`tag ${tone}`}>{label}</span>
      </div>

      <div className="scorebar">
        <i style={{ width: `${safeScore}%` }} />
      </div>
    </div>
  );
}
