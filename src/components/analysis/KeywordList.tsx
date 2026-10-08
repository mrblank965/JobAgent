type KeywordListProps = {
  title: string;
  items: string[];
  tone?: "success" | "warning" | "danger";
};

const toneClass = {
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
};

export function KeywordList({ title, items, tone = "success" }: KeywordListProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-bold">{title}</h3>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className={`rounded-full px-3 py-1.5 text-sm font-medium ${toneClass[tone]}`}>{item}</span>
        ))}
      </div>
    </section>
  );
}
