"use client";

import {
  MIN_RESUME_LENGTH,
  SECTION_KEYWORDS,
  SECTION_LABELS,
  SECTION_ORDER,
  SKILL_DICTIONARY,
} from "@/lib/parsers/resumeText";
import { ResumeUpload } from "./ResumeUpload";

/** 低于这个字数仍然允许解析，但会提醒结果可能不完整。 */
const SOFT_MIN_LENGTH = 120;

type ResumeTextInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onReset: () => void;
  onFileSelect: (file: File) => void;
  fileName: string;
  extracting: boolean;
  loading: boolean;
  hasResult: boolean;
};

/**
 * 简历的输入区，包含上传文件和粘贴全文两种方式。
 *
 * 上传只是把文件变成文字填进下面的文本框，之后的解析和编辑两条路完全共用，
 * 所以这里不需要为上传单独准备结果区或错误提示。
 */
export function ResumeTextInput({
  value,
  onChange,
  onSubmit,
  onReset,
  onFileSelect,
  fileName,
  extracting,
  loading,
  hasResult,
}: ResumeTextInputProps) {
  const length = value.trim().length;
  const tooShort = length < MIN_RESUME_LENGTH;
  const busy = loading || extracting;
  const disabled = busy || tooShort;

  let hint = "";
  let hintClass = "tiny mt8";

  if (extracting) {
    hint = "正在读取文件并提取文字……";
  } else if (length === 0) {
    hint = `上传文件，或直接粘贴简历全文。粘贴的话至少需要 ${MIN_RESUME_LENGTH} 个字。`;
  } else if (tooShort) {
    hint = `还差 ${MIN_RESUME_LENGTH - length} 个字，满 ${MIN_RESUME_LENGTH} 个字才能解析。`;
    hintClass = "tiny mt8 warn-text";
  } else if (length < SOFT_MIN_LENGTH) {
    hint = "内容较短，解析结果可能不完整，可以先解析一次再手动补充。";
    hintClass = "tiny mt8 warn-text";
  } else {
    hint = "字数已够，可以开始解析。";
  }

  const buttonLabel = loading ? "解析中…" : hasResult ? "重新解析" : "解析简历";

  return (
    <div className="card">
      <div className="spread">
        <h3>简历内容</h3>
        <span className="tiny">{length} 字</span>
      </div>

      <textarea
        id="resume-text"
        className="input"
        style={{ height: 380 }}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={busy}
        placeholder="把简历正文整段粘贴到这里，例如教育背景、实习经历、专业技能、个人优势等段落……"
      />

      <div className="row mt8">
        <button type="button" className="btn primary" onClick={onSubmit} disabled={disabled}>
          {buttonLabel}
        </button>
        <ResumeUpload fileName={fileName} onSelect={onFileSelect} disabled={busy} />
        <button
          type="button"
          className="btn ghost sm"
          onClick={onReset}
          disabled={busy || (value.length === 0 && !hasResult && fileName.length === 0)}
        >
          清空重来
        </button>
      </div>

      <div className={hintClass}>{hint}</div>

      <div className="mt12 warnbox">
        当前使用本地规则演示解析，没有调用 AI 模型。文本只保留在这个页面的内存里，不会保存到服务器或浏览器存储，刷新后会消失。
      </div>

      <details className="mt12 rules">
        <summary>解析规则说明</summary>
        <div className="mt8">
          <p className="tiny">
            一行文字去掉开头序号和结尾冒号后，完全等于下面的词，才算段落标题。标题下面的行归入对应字段。
          </p>
          <p className="tiny mt8">
            此外还认三种写法。整行由两个以上关键词拼起来的，例如科研竞赛、科研与竞赛。带项目符号的，例如 ◆ 项目经历。
            标题后面直接跟着内容的，例如 项目经历《某论文》 第一作者，这种是 PDF 提取时没留空格造成的。
          </p>

          <table className="t mt8">
            <tbody>
              {SECTION_ORDER.map((key) => (
                <tr key={key}>
                  <th style={{ width: 72 }}>{SECTION_LABELS[key]}</th>
                  <td className="muted">{SECTION_KEYWORDS[key].join("、")}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="tiny mt8">
            姓名只在前 5 行里找。先看有没有姓名：这种写法，再找第一个像人名的短行。找不到就留空，不猜。
          </p>

          <p className="tiny mt8">
            教育段落里，奖学金、荣誉称号这类会被单独挑出来放进荣誉奖励，不算学历，因为它们经常被写进教育段落里。
            带日期的一行算一条学历，没有日期的行归入上一条，通常那是 GPA 或者主修课程。
            每条会拆成学历层次、学校、学院、专业、时间、学业表现六块。学历从博士、硕士、本科、专科这些词判断。
            学校取第一个词，专业取最后一个词，中间的都是学院。学业表现从 GPA、绩点、均分、成绩、排名这些词开始，抓到下一个标点为止。
          </p>

          <p className="tiny mt8">
            技能段落里，一行中的顿号、逗号、分号、斜杠会拆成多个技能。全文里以熟练、熟悉、掌握、精通这类词开头、
            到下一个标点为止的句子会整句保留，例如 熟练使用 Wind 数据库 就按整句收，不再只抽出一个 Wind。
            词典里被原文提到的词也会收，但如果已经包含在上面那些句子里就不再单独列一次。
          </p>

          <p className="tiny mt8">
            事项会自动分点。行内出现项目符号会按符号切开，这样 PDF 把多条挤成一行也能还原。
            写成 短标签：描述 这种结构的整条会原样保留，不再往下拆。没有标签的段落才按标点拆，
            出现句号、分号或行内序号 ①②③ 就断开，逗号后面跟着负责、参与、协助这类动作词也会断开。
          </p>

          <p className="tiny mt8">
            经历段落里，一条经历由标题行和下面的事项行组成。带短横线或圆点的行算事项。
            出现日期就算新标题，日期写在开头、行内成区间、或者落在行尾都认。段落的第一行也算标题。
            标题会被进一步拆成名称、职位和时间三块。时间是识别出来的，简历一般只写到月份，所以日期统一补 01，
            例如 2026.03 会变成 2026-03-01，可以自己改。名称和职位在第一个括号外的空格处切开，所以带括号的公司名不会被切碎。
            标记为竞赛的条目只有一个获奖时间，所以那种条目只显示一个日期。
          </p>

          <p className="tiny mt8">
            项目经历里的每一条会自动标上类型。出现第一作者、通讯作者、发表于、期刊这类词算论文，
            出现竞赛、大赛、获奖、二等奖这类词算竞赛，其余算普通项目。标错了可以在编辑区点一下改。
          </p>

          <p className="tiny mt8">
            技能词典：{SKILL_DICTIONARY.join("、")}
          </p>

          <p className="tiny mt8">
            PDF 里有些汉字会被字体映射到康熙部首区，肉眼一样但码点不同。解析前会先把这些字符归一成正常汉字。
          </p>
        </div>
      </details>
    </div>
  );
}
