type MatchScoreProps = { score: number; label?: string };

export function MatchScore({ score, label = "演示数据" }: MatchScoreProps) {
  const safeScore = Math.max(0, Math.min(100, score));

  return (
    <div className="card">
      <div className="spread">
        <div>
          <div className="tiny">简历与岗位匹配度</div>
          <div className="bignum">
            {safeScore}
            <small>%</small>
          </div>
        </div>
        <span className="tag partial">{label}</span>
      </div>

      <div className="scorebar">
        <i style={{ width: `${safeScore}%` }} />
      </div>
    </div>
  );
}
