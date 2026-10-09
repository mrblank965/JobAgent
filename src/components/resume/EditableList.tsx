"use client";

type EditableListProps = {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  emptyHint: string;
  itemLabel: string;
};

/**
 * 逐条编辑的列表，用于教育。
 * 每一条都是一个输入框，右侧可以删除，底部可以新增空条目。
 * 空条目只是界面上的空行，提交给下游之前会被过滤掉。
 */
export function EditableList({ label, items, onChange, placeholder, emptyHint, itemLabel }: EditableListProps) {
  function updateItem(index: number, value: string) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  }

  function moveItem(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;

    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    onChange(next);
  }

  function addItem() {
    onChange([...items, ""]);
  }

  return (
    <div className="rounded-[4px] border border-hair bg-wash p-4">
      <div className="mb-3 flex items-baseline justify-between border-b border-hair pb-2.5">
        <span className="title text-lg">{label}</span>
        <span className="font-mono text-[11px] tracking-widest text-sub">{items.length} 条</span>
      </div>

      {items.length === 0 ? (
        <p className="mb-3 rounded-[3px] border border-dashed border-hair bg-white px-3 py-2.5 text-sm text-sub">
          {emptyHint}
        </p>
      ) : (
        <ul className="mb-3 space-y-2">
          {items.map((item, index) => (
            <li key={index} className="flex gap-2">
              <input
                value={item}
                onChange={(event) => updateItem(index, event.target.value)}
                placeholder={placeholder}
                className="min-w-0 flex-1 rounded-[3px] border border-hair bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-sub focus:border-brand focus:ring-2 focus:ring-brandwash"
              />
              <button
                type="button"
                onClick={() => moveItem(index, -1)}
                disabled={index === 0}
                aria-label="上移"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[3px] border border-hair bg-white text-xs text-ink2 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:border-hair disabled:text-hair"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveItem(index, 1)}
                disabled={index === items.length - 1}
                aria-label="下移"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[3px] border border-hair bg-white text-xs text-ink2 transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:border-hair disabled:text-hair"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeItem(index)}
                aria-label={`删除第 ${index + 1} 条${itemLabel}`}
                className="shrink-0 rounded-[3px] border border-hair bg-white px-3 py-2 text-sm text-sub transition hover:border-brand hover:text-brand"
              >
                删除
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={addItem}
        className="rounded-[3px] border border-dashed border-sub px-4 py-2 text-sm font-medium text-ink2 transition hover:border-brand hover:text-brand"
      >
        ＋ 新增一条{itemLabel}
      </button>
    </div>
  );
}
