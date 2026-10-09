"use client";

import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/parsers/resumeText";
import type { ExperienceCategory, ExperienceEntry } from "@/types/analysis";

type ExperienceEditorProps = {
  label: string;
  itemLabel: string;
  items: ExperienceEntry[];
  onChange: (items: ExperienceEntry[]) => void;
  emptyHint: string;
  titlePlaceholder: string;
  roleLabel: string;
  rolePlaceholder: string;
  /** 是否显示类型切换。项目经历需要区分论文、竞赛、项目，实习经历不需要。 */
  showCategory?: boolean;
};

/**
 * 经历编辑器，实习经历和项目经历共用。
 *
 * 一条经历压成三行：名称加职位一行，时间加操作按钮一行，事项一行。
 * 竞赛类的条目只有一个获奖时间，所以那种情况只显示一个日期选择器。
 */
export function ExperienceEditor({
  label,
  itemLabel,
  items,
  onChange,
  emptyHint,
  titlePlaceholder,
  roleLabel,
  rolePlaceholder,
  showCategory = false,
}: ExperienceEditorProps) {
  function updateItem(index: number, patch: Partial<ExperienceEntry>) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
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
    onChange([...items, { title: "", role: "", periodStart: "", periodEnd: "", bullets: [""] }]);
  }

  return (
    <div>
      <div className="spread">
        <span className="subhead">{label}</span>
        <span className="tiny">{items.length} 段</span>
      </div>

      {items.length === 0 ? (
        <div className="empty mt8">{emptyHint}</div>
      ) : (
        <div className="mt8">
          {items.map((item, index) => {
            const category = item.category ?? "project";
            // 竞赛只有一个获奖时间，没有起止区间
            const singleDate = showCategory && category === "competition";

            return (
              <div key={index} className={`entry tight ${showCategory ? "p" : "b"}`} style={{ marginBottom: 8 }}>
                <div className="entry-fields">
                  <input
                    className="input"
                    value={item.title}
                    onChange={(event) => updateItem(index, { title: event.target.value })}
                    placeholder={titlePlaceholder}
                  />
                  <input
                    className="input"
                    value={item.role}
                    onChange={(event) => updateItem(index, { role: event.target.value })}
                    placeholder={rolePlaceholder}
                    aria-label={roleLabel}
                  />
                </div>

                <div className="spread mt8">
                  <div className="entry-time">
                    <span className="tiny">{singleDate ? "获奖时间" : "时间"}</span>
                    <input
                      type="date"
                      className="input"
                      value={item.periodStart}
                      onChange={(event) => updateItem(index, { periodStart: event.target.value })}
                      aria-label={singleDate ? "获奖时间" : "起始时间"}
                    />
                    {singleDate ? null : (
                      <>
                        <span className="tiny">至</span>
                        <input
                          type="date"
                          className="input"
                          value={item.periodEnd}
                          onChange={(event) => updateItem(index, { periodEnd: event.target.value })}
                          aria-label="结束时间"
                        />
                      </>
                    )}
                  </div>

                  <div className="row gap8">
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0}
                      aria-label="上移"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn sm"
                      onClick={() => moveItem(index, 1)}
                      disabled={index === items.length - 1}
                      aria-label="下移"
                    >
                      ↓
                    </button>
                    <button type="button" className="btn sm danger" onClick={() => removeItem(index)}>
                      删除
                    </button>
                  </div>
                </div>

                {showCategory ? (
                  <div className="row mt8">
                    <span className="tiny">类型</span>
                    {CATEGORY_ORDER.map((option: ExperienceCategory) => (
                      <button
                        key={option}
                        type="button"
                        className={`itab${category === option ? " active" : ""}`}
                        onClick={() => updateItem(index, { category: option })}
                      >
                        {CATEGORY_LABELS[option]}
                      </button>
                    ))}
                  </div>
                ) : null}

                <textarea
                  className="input mt8"
                  style={{ height: 76 }}
                  value={item.bullets.join("\n")}
                  onChange={(event) => updateItem(index, { bullets: event.target.value.split("\n") })}
                  placeholder="在这段经历里做的事，每行一条"
                  aria-label="事项"
                />
              </div>
            );
          })}
        </div>
      )}

      <button type="button" className="btn mt8" onClick={addItem}>
        ＋ 新增一条{itemLabel}
      </button>
    </div>
  );
}
