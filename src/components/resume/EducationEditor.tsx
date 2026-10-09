"use client";

import { DEGREE_LABELS, DEGREE_ORDER } from "@/lib/parsers/resumeText";
import type { EducationDegree, EducationEntry } from "@/types/analysis";

type EducationEditorProps = {
  items: EducationEntry[];
  onChange: (items: EducationEntry[]) => void;
};

/**
 * 教育编辑器。
 * 一条学历压成四行：学历层次一行，学校学院一行，专业学业表现一行，时间加操作按钮一行。
 */
export function EducationEditor({ items, onChange }: EducationEditorProps) {
  function updateItem(index: number, patch: Partial<EducationEntry>) {
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
    onChange([
      ...items,
      {
        degree: "other",
        school: "",
        college: "",
        major: "",
        periodStart: "",
        periodEnd: "",
        performance: "",
      },
    ]);
  }

  return (
    <div>
      <div className="spread">
        <span className="subhead">教育</span>
        <span className="tiny">{items.length} 条</span>
      </div>

      {items.length === 0 ? (
        <div className="empty mt8">没有识别到教育段落，可以点下面的按钮手动补充。</div>
      ) : (
        <div className="mt8">
          {items.map((item, index) => (
            <div key={index} className="entry tight c" style={{ marginBottom: 8 }}>
              <div className="row gap8">
                {DEGREE_ORDER.map((option: EducationDegree) => (
                  <button
                    key={option}
                    type="button"
                    className={`itab${item.degree === option ? " active" : ""}`}
                    onClick={() => updateItem(index, { degree: option })}
                  >
                    {DEGREE_LABELS[option]}
                  </button>
                ))}
              </div>

              <div className="entry-fields mt8">
                <input
                  className="input"
                  value={item.school}
                  onChange={(event) => updateItem(index, { school: event.target.value })}
                  placeholder="学校，例如 中山大学"
                  aria-label="学校"
                />
                <input
                  className="input"
                  value={item.college}
                  onChange={(event) => updateItem(index, { college: event.target.value })}
                  placeholder="学院，例如 岭南学院"
                  aria-label="学院"
                />
              </div>

              <div className="entry-fields mt8">
                <input
                  className="input"
                  value={item.major}
                  onChange={(event) => updateItem(index, { major: event.target.value })}
                  placeholder="专业，例如 金融专硕"
                  aria-label="专业"
                />
                <input
                  className="input"
                  value={item.performance}
                  onChange={(event) => updateItem(index, { performance: event.target.value })}
                  placeholder="学业表现，例如 GPA 3.8/4.0"
                  aria-label="学业表现"
                />
              </div>

              <div className="spread mt8">
                <div className="entry-time">
                  <span className="tiny">时间</span>
                  <input
                    type="date"
                    className="input"
                    value={item.periodStart}
                    onChange={(event) => updateItem(index, { periodStart: event.target.value })}
                    aria-label="入学时间"
                  />
                  <span className="tiny">至</span>
                  <input
                    type="date"
                    className="input"
                    value={item.periodEnd}
                    onChange={(event) => updateItem(index, { periodEnd: event.target.value })}
                    aria-label="毕业时间"
                  />
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
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn mt8" onClick={addItem}>
        ＋ 新增一条教育
      </button>
    </div>
  );
}
