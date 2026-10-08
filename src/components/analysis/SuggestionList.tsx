type SuggestionListProps = { suggestions: string[] };

export function SuggestionList({ suggestions }: SuggestionListProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold">简历修改建议</h3>
      <ol className="mt-4 space-y-3">
        {suggestions.map((suggestion, index) => (
          <li key={suggestion} className="flex gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{index + 1}</span>
            {suggestion}
          </li>
        ))}
      </ol>
    </section>
  );
}
