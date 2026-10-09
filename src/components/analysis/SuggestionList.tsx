type SuggestionListProps = { suggestions: string[] };

export function SuggestionList({ suggestions }: SuggestionListProps) {
  return (
    <div className="card">
      <h3>简历修改建议</h3>
      <div className="mt8">
        {suggestions.map((suggestion, index) => (
          <div key={suggestion} className="ev" style={{ paddingTop: 6, paddingBottom: 6 }}>
            <b style={{ color: "var(--accent)" }}>{String(index + 1).padStart(2, "0")}</b>
            <span style={{ marginLeft: 8 }}>{suggestion}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
