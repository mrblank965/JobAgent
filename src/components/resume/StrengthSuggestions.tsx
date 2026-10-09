"use client";

import { suggestStrengths } from "@/lib/strengths";
import type { ResumeData } from "@/types/analysis";

type StrengthSuggestionsProps = {
  resume: ResumeData;
  current: string[];
  onAdd: (value: string) => void;
};

/**
 * 候选优势。
 *
 * 从已经解析出的技能、经历、项目里归纳几条，每条一行的紧凑排布，
 * 依据放在 title 里做成悬停提示，不占版面。
 * 它们只是候选，用户点加号才会进入优势列表，不会自动写入。
 */
export function StrengthSuggestions({ resume, current, onAdd }: StrengthSuggestionsProps) {
  const candidates = suggestStrengths(resume);
  if (candidates.length === 0) return null;

  const existing = new Set(current.map((item) => item.trim().toLowerCase()));

  return (
    <div>
      <label className="fl">
        候选优势
        <span className="tiny" style={{ marginLeft: 6 }}>
          从简历已有内容归纳，点 ＋ 加入
        </span>
      </label>

      <div>
        {candidates.map((candidate) => {
          const added = existing.has(candidate.text.trim().toLowerCase());

          return (
            <div key={candidate.text} className="candidate" title={`依据：${candidate.reason}`}>
              <button
                type="button"
                className={`btn sm${added ? "" : " primary"}`}
                disabled={added}
                onClick={() => onAdd(candidate.text)}
                aria-label={added ? "已加入" : `加入 ${candidate.text}`}
              >
                {added ? "✓" : "＋"}
              </button>
              <span className={added ? "tiny" : ""} style={{ fontSize: 13 }}>
                {candidate.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
