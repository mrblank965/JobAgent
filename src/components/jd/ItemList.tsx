import { stripItemOrdinal } from "@/lib/jd";

type ItemListProps = {
  items: string[];
  /** 一条都没有时显示的话。 */
  empty: string;
};

/**
 * 一个栏目里的条目，按顺序重新编号。
 *
 * 编号由列表自己出，不沿用原文里的序号：原文可能从 3 开始，或者几件事挤在一条里，
 * 原文的序号跟切出来的条目对不上。解析时残留的序号在这里再剥一道。
 */
export function ItemList({ items, empty }: ItemListProps) {
  if (items.length === 0) return <div className="tiny">{empty}</div>;

  return (
    <ol className="muted" style={{ paddingLeft: 22, fontSize: 13 }}>
      {items.map((line, index) => (
        <li key={`${index}-${line}`}>{stripItemOrdinal(line)}</li>
      ))}
    </ol>
  );
}
