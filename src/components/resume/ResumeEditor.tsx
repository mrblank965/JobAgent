"use client";

import { SECTION_LABELS, type RecognizedHeading } from "@/lib/parsers/resumeText";
import type { ResumeData } from "@/types/analysis";
import { ExperienceEditor } from "./ExperienceEditor";
import { StrengthSuggestions } from "./StrengthSuggestions";
import { TagEditor } from "./TagEditor";

type ResumeEditorProps = {
  value: ResumeData;
  onChange: (next: ResumeData) => void;
  headings: RecognizedHeading[];
  suspectedHeadings: string[];
};

/**
 * 明细区，对应参考页下方那块。
 *
 * 上面一张卡片放技能、优势、荣誉这类概括性内容，
 * 下面一张卡片放实习与项目经历，最后是标题识别诊断。
 * 它自己不保存状态，所有修改都通过 onChange 交回父组件。
 */
export function ResumeEditor({ value, onChange, headings, suspectedHeadings }: ResumeEditorProps) {
  /** 把一条候选优势加入列表，重复的不重复加入。 */
  function addStrength(candidate: string) {
    const trimmed = candidate.trim();
    if (trimmed.length === 0) return;
    if (value.strengths.some((item) => item.toLowerCase() === trimmed.toLowerCase())) return;
    onChange({ ...value, strengths: [...value.strengths, trimmed] });
  }

  return (
    <>
      <div className="card">
        <div className="spread">
          <h3>技能、优势与荣誉</h3>
          <span className="tiny">改动只留在当前页面内存里，刷新即清空</span>
        </div>

        <div className="split mt8">
          <TagEditor
            label="技能标签"
            items={value.skills}
            onChange={(skills) => onChange({ ...value, skills })}
            placeholder="添加技能，回车"
            emptyHint="尚无技能，先在上方粘贴简历或上传文件解析。"
          />

          <TagEditor
            label="个人优势"
            items={value.strengths}
            onChange={(strengths) => onChange({ ...value, strengths })}
            placeholder="如：跨文理工背景，能快速建模"
            emptyHint="没有识别到个人优势或自我评价段落，可以在这里逐个添加。"
          />

          <TagEditor
            label="荣誉奖励"
            items={value.honors}
            onChange={(honors) => onChange({ ...value, honors })}
            placeholder="如：国家奖学金（2023）"
            emptyHint="没有识别到奖学金或荣誉称号。"
          />

          <StrengthSuggestions resume={value} current={value.strengths} onAdd={addStrength} />
        </div>
      </div>

      <div className="card mt12">
        <div className="spread">
          <h3>实习与项目明细（可手动修正）</h3>
          <span className="tiny">每行一条事项，可以上下调整顺序</span>
        </div>

        <div className="mt12">
          <ExperienceEditor
            label="实习与工作经历"
            itemLabel="经历"
            items={value.experiences}
            onChange={(experiences) => onChange({ ...value, experiences })}
            emptyHint="没有识别到实习或工作经历段落，可以点下面的按钮手动补充。"
            titlePlaceholder="机构或公司名称，例如 某证券公司"
            roleLabel="职位"
            rolePlaceholder="例如 研究助理"
          />
        </div>

        <div className="mt16">
          <ExperienceEditor
            label="项目经历"
            itemLabel="项目"
            items={value.projects}
            onChange={(projects) => onChange({ ...value, projects })}
            emptyHint="没有识别到项目经历、科研或论文段落，可以点下面的按钮手动补充。"
            titlePlaceholder="项目、赛事或论文名称，例如 某课题研究"
            roleLabel="角色"
            rolePlaceholder="例如 第一作者"
            showCategory
          />
        </div>
      </div>

      {headings.length > 0 ? (
        <div className="card mt12">
          <div className="spread">
            <h3>识别到的段落标题</h3>
            <span className="tiny">{headings.length} 个</span>
          </div>

          <div className="mt8">
            {headings.map((heading, index) => (
              <span key={`${heading.text}-${index}`} className="chip">
                {heading.text}
                <span className="muted">→ {SECTION_LABELS[heading.section]}</span>
              </span>
            ))}
          </div>

          {suspectedHeadings.length > 0 ? (
            <>
              <div className="spread mt12" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <b style={{ fontSize: 13 }}>疑似没识别的小标题</b>
              </div>
              <div className="mt8">
                {suspectedHeadings.map((text) => (
                  <span key={text} className="chip miss">
                    {text}
                  </span>
                ))}
              </div>
              <div className="tiny mt8">
                这些行可能是你简历里的栏目名但没被认出，它们下面的内容会归入上一段。把这里的原文发给成员 B 即可修好。
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
