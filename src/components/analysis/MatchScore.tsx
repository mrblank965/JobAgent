type MatchScoreProps = { score: number; label?: string };

export function MatchScore({ score, label = "演示数据" }: MatchScoreProps) {
  const safeScore = Math.max(0, Math.min(100, score));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">简历与岗位匹配度</p>
          <p className="mt-2 text-4xl font-bold text-blue-600">{safeScore}%</p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">{label}</span>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${safeScore}%` }} />
      </div>
    </section>
  );
}
