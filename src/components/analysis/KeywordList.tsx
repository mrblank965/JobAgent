type KeywordListProps = {
  title: string;
  items: string[];
  tone?: "success" | "warning" | "danger";
};

const toneClass = {
  success: "chip hit",
  warning: "chip partial",
  danger: "chip miss",
};

export function KeywordList({ title, items, tone = "success" }: KeywordListProps) {
  return (
    <div className="card">
      <div className="spread">
        <h3>{title}</h3>
        <span className="tiny">{items.length}</span>
      </div>
      <div className="mt8">
        {items.map((item) => (
          <span key={item} className={toneClass[tone]}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
