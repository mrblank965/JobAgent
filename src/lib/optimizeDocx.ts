import { cleanTitle, isSectionTitle, stripMarkdown } from "@/lib/optimize";
import { hasHints, stripHints, tokenizeHints } from "@/lib/resumeTemplate";

/**
 * 把简历正文排成一份 Word 文档。
 *
 * 版式按课程需求单逐条执行，不自行加码。换算关系：1 磅 = 20 twip，1 cm ≈ 567 twip。
 * - Letter 纸（12240 × 15840 twip），上 0.5 cm、下 0.4 cm、左右 1.27 cm
 * - 西文与数字 Times New Roman，中文楷体，全文黑色
 * - 正文固定行距 16 磅，段前段后 0（姓名行、联系方式行按需求单另设）
 * - 姓名 16 磅加粗居中，行距 20 磅、段前后 9 磅
 * - 联系方式 11 磅居中，行距 16 磅、段前后 9 磅
 * - 一级标题 12 磅加粗左对齐，下框线 0.5 磅 #666666、距文字 1 磅
 * - 条目行 10.5 磅整行加粗，制表位 11.3 cm 居中、18.4 cm 右对齐
 * - 教育条目多一列学历，用到 11.3 cm 居中、15.2 cm 居中、18.4 cm 右端三个位置
 * - 要点行 10.5 磅，左缩进和悬挂缩进都是 0.38 cm，两端对齐
 *
 * 需求单写明「所有规格均须精确执行，不得自行改动」，所以这里不再做超页自动缩字号。
 * 一页装不下时由 estimateDocxLines 报出超出几行，删内容而不是改版式。
 *
 * 模板提示（〔〕里的字）仍然用黑色斜体，能和正文区分，也不违反「全文黑色」。
 */

/** Letter 尺寸，单位 twip：8.5 × 11 英寸。 */
const PAGE_WIDTH = 12240;
const PAGE_HEIGHT = 15840;

/** 页边距：上 0.5 cm、下 0.4 cm、左右 1.27 cm。 */
const MARGIN_TOP = 283;
const MARGIN_BOTTOM = 227;
const MARGIN_SIDE = 720;

/** 正文可用高度与宽度（宽度单位：磅）。 */
const AVAILABLE_HEIGHT = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
const TEXT_WIDTH_PT = (PAGE_WIDTH - MARGIN_SIDE * 2) / 20;

/** 厘米换算成 twip，制表位用。 */
const cm = (value: number) => Math.round((value / 2.54) * 1440);

/**
 * 折行安全系数。
 *
 * 中文字符宽度按字号算，中文标点按 0.6 算（Word 有标点挤压），这样一行能放多少字
 * 和实测基本对得上。宽度不再打折，高度还留 4% 余量，给标点调整留位置。
 */
const WRAP_SAFETY = 1;

/**
 * 估算结果再留 4% 余量。
 *
 * 估算是按字数折算的，Word 真正排版时会因为标点挤压、字距微调多出一两行。
 * 只估到"刚好等于可用高度"的话，真实排版往往就溢出了，所以判定能不能装进一页
 * 时要求高度不超过可用高度的 96%。
 */
const FIT_MARGIN = 0.96;

/** 姓名、联系方式行前后的间距，单位 twip：9 磅 = 180。 */
const GAP_NAME = 180;

/**
 * 制表位，单位 twip。需求单指定中间 11.3 cm 居中、右端 18.4 cm 右对齐。
 * 教育条目多一列学历，在 15.2 cm 处再加一个居中位。
 */
const ENTRY_TABS = [
  { type: "center" as const, position: cm(11.3) },
  { type: "right" as const, position: cm(18.4) },
];

const EDUCATION_TABS = [
  { type: "center" as const, position: cm(11.3) },
  { type: "center" as const, position: cm(15.2) },
  { type: "right" as const, position: cm(18.4) },
];

/** 要点行的左缩进和悬挂缩进：0.38 cm ≈ 215 twip。 */
const BULLET_INDENT = 215;

/** 中文用楷体，西文和数字用 Times New Roman（eastAsia 必须单列，否则中文会被西文字体渲染）。 */
const FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "楷体" };

/** 可选板块的标题尾巴，例如「校园经历（可选择）」。 */
const OPTIONAL_TITLE = /[（(]\s*可选择?\s*[）)]$/;

const PROSE_SECTIONS = ["个人优势", "自我评价", "个人总结"];

export type DocxDensity = "strict";

/**
 * 需求单上的原始参数，只有这一档。字号单位半磅，行距单位 twip。
 *
 * body/entry 21 = 10.5 磅，heading 24 = 12 磅，name 32 = 16 磅，contact 22 = 11 磅。
 * line 320 = 固定行距 16 磅，nameLine 400 = 20 磅。
 */
export const LAYOUTS: Record<
  DocxDensity,
  { body: number; entry: number; heading: number; name: number; contact: number; line: number; nameLine: number }
> = {
  strict: { body: 21, entry: 21, heading: 24, name: 32, contact: 22, line: 320, nameLine: 400 },
};

const DATE_TOKEN = "\\d{4}\\s*(?:[.\\-/年]\\s*\\d{1,2})?";
const DATE_RANGE = new RegExp(`${DATE_TOKEN}(?:\\s*[—–~～\\-至到]\\s*${DATE_TOKEN})?`);

/**
 * 把条件标题拆成「左 / 中 / 日期 / 附加」四段。
 */
export function splitEntryParts(
  line: string,
): { left: string; middle: string; date: string; extra: string } | null {
  const matched = DATE_RANGE.exec(line);
  if (!matched || matched[0].trim().length === 0) return null;

  const date = matched[0].trim();
  const before = line.slice(0, matched.index).trim().replace(/[｜|·\-—–,，]\s*$/, "").trim();
  const after = line.slice(matched.index + matched[0].length).trim().replace(/^[｜|·,，]\s*/, "");

  if (!before) return null;

  const splitAt = before.search(/[\s｜|]/);
  const left = splitAt > 0 ? before.slice(0, splitAt) : before;
  const middle = splitAt > 0 ? before.slice(splitAt + 1).replace(/^[｜|]\s*/, "").trim() : "";

  return { left, middle, date, extra: after };
}

/** 把「小标题：内容」拆开。冒号前不超过 12 个字才算小标题。 */
export function splitLabel(text: string): { label: string; rest: string } | null {
  const matched = /^([^：:]{2,12})[：:]\s*(.+)$/.exec(text.trim());
  if (!matched) return null;
  return { label: matched[1].trim(), rest: matched[2].trim() };
}

/** 联系方式按「邮箱：xxx ｜ 其他」重排。 */
export function formatContactLine(raw: string): string {
  const parts = raw
    .split(/[｜|]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const email = raw.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? "";

  if (!email) return parts.join(" ｜ ");

  const others = parts
    .filter((item) => !item.includes(email))
    .map((item) => item.replace(/^(邮箱|email)\s*[:：]\s*/i, "").trim())
    .filter(Boolean);

  return [`邮箱：${email}`, ...others].join(" ｜ ");
}

type ResumeBlock = { title: string; optional?: boolean; body: string[] };

/** 把纯文本简历拆成"姓名 + 联系方式 + 若干板块"。 */
export function parseResumeText(text: string): { name: string; contact: string; blocks: ResumeBlock[] } {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const blocks: ResumeBlock[] = [];
  const contactLines: string[] = [];
  let name = "";
  let current: ResumeBlock | null = null;

  for (const line of lines) {
    if (isSectionTitle(line)) {
      current = { title: cleanTitle(line), optional: OPTIONAL_TITLE.test(line.trim()), body: [] };
      blocks.push(current);
      continue;
    }

    if (!name) {
      name = line;
      continue;
    }

    if (!current) {
      contactLines.push(line);
      continue;
    }

    current.body.push(line);
  }

  return { name, contact: contactLines.join("｜"), blocks };
}

/** 估算一行文字占多宽（磅）。中文按一个字宽，西文按 0.55，中文标点按 0.6（Word 会做标点挤压）。 */
function textWidthPt(value: string, sizePt: number): number {
  let width = 0;
  for (const char of value) {
    if (/[，。、；：！？（）《》【】「」『』]/.test(char)) width += sizePt * 0.6;
    else width += /[⺀-鿿　-〿＀-￯]/.test(char) ? sizePt : sizePt * 0.55;
  }
  return width;
}

/**
 * 估算这份草稿排出来要多少行、一页能放多少行。
 *
 * 不是真的渲染排版，是按字数折算折行，准确度到"±2 行"这个量级，
 * 够用来判断这一页还装不装得下。
 */
export function estimateDocxLines(
  text: string,
  density: DocxDensity = "strict",
): { lines: number; capacity: number; fits: boolean } {
  const layout = LAYOUTS[density];
  const sizePt = layout.body / 2;
  const { name, contact, blocks } = parseResumeText(text);

  let height = 0;
  const addLines = (value: string, size: number, widthPt: number) => {
    const count = Math.max(1, Math.ceil(textWidthPt(value, size) / (widthPt * WRAP_SAFETY)));
    return count * layout.line;
  };

  if (name) height += layout.nameLine + GAP_NAME * 2;
  if (contact) height += addLines(formatContactLine(contact), layout.contact / 2, TEXT_WIDTH_PT) + GAP_NAME * 2;

  /**
   * 条目行（公司 / 部门职位 / 日期）挤在一行，估宽超过版心就会折成两行。
   * 以前这里固定按一行算，公司名长一点就会少算一行，这正是导出超页的来源之一。
   */
  const entryLines = (value: string, size: number) =>
    Math.max(1, Math.ceil(textWidthPt(value, size) / (TEXT_WIDTH_PT * WRAP_SAFETY))) * layout.line;

  for (const block of blocks) {
    height += layout.line + 40; // 标题行 + 下框线占用的间距
    const isProse = PROSE_SECTIONS.includes(cleanTitle(block.title));

    for (let index = 0; index < block.body.length; index += 1) {
      const line = block.body[index];
      const hasMarker = /^[-•·]\s*/.test(line);
      const content = stripMarkdown(line.replace(/^[-•·]\s*/, ""));
      const parts = hasMarker || isProse ? null : splitEntryParts(content);

      if (parts) {
        const merged = [parts.left, parts.middle, parts.extra].filter(Boolean).join(" ");
        height += entryLines(`${merged} ${parts.date}`, layout.entry / 2);
        continue;
      }

      const isHeader = !hasMarker && !isProse && /^[-•·]\s*/.test(block.body[index + 1] ?? "");
      if (isHeader) {
        height += entryLines(content, layout.entry / 2);
        continue;
      }

      const asBullet = hasMarker || !isProse;
      const width = asBullet ? TEXT_WIDTH_PT - BULLET_INDENT / 20 - 2 : TEXT_WIDTH_PT;
      height += addLines(asBullet ? `• ${content}` : content, sizePt, Math.max(120, width));
    }
  }

  const usable = AVAILABLE_HEIGHT * FIT_MARGIN;
  const capacity = Math.floor(usable / layout.line);
  const lines = Math.ceil(height / layout.line);
  return { lines, capacity, fits: height <= usable };
}

/**
 * 生成 .docx 文件的二进制内容。
 *
 * docx 这个库只在这里用得到，所以用动态 import 按需加载。
 */
export async function buildResumeDocx(
  text: string,
  options: { stripHints?: boolean; density?: DocxDensity } = {},
): Promise<Blob> {
  const {
    AlignmentType,
    Document,
    Packer,
    Paragraph,
    TextRun,
    BorderStyle,
    LineRuleType,
    TabStopType,
    Tab,
  } = await import("docx");

  const layout = LAYOUTS[options.density ?? "strict"];

  const runsOf = (content: string, base: { bold?: boolean; size: number }): InstanceType<typeof TextRun>[] => {
    if (!hasHints(content)) {
      return [new TextRun({ text: content, bold: base.bold, size: base.size, font: FONT })];
    }

    return tokenizeHints(content)
      .filter((token) => token.text.length > 0)
      .map((token) =>
        token.hint
          ? new TextRun({ text: token.text, italics: true, size: base.size, font: FONT })
          : new TextRun({ text: token.text, bold: base.bold, size: base.size, font: FONT }),
      );
  };

  const tab = () => new TextRun({ children: [new Tab()] });

  const source = options.stripHints ? stripHints(text) : text;
  const { name, contact, blocks } = parseResumeText(source);
  const children: InstanceType<typeof Paragraph>[] = [];

  if (name) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: layout.nameLine, lineRule: LineRuleType.EXACT, before: GAP_NAME, after: GAP_NAME },
        widowControl: false,
        children: runsOf(name, { bold: true, size: layout.name }),
      }),
    );
  }

  if (contact) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: layout.line, lineRule: LineRuleType.EXACT, before: GAP_NAME, after: GAP_NAME },
        widowControl: false,
        children: runsOf(formatContactLine(contact), { size: layout.contact }),
      }),
    );
  }

  for (const block of blocks) {
    const headingText = block.optional ? `${block.title}（可选择）` : block.title;
    const isEducation = /教育/.test(block.title);
    const isProseBlock = PROSE_SECTIONS.includes(cleanTitle(block.title));

    children.push(
      new Paragraph({
        spacing: { line: layout.line, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
        widowControl: false,
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "666666", space: 1 } },
        children: [
          new TextRun({
            text: headingText,
            bold: true,
            italics: block.optional || undefined,
            size: layout.heading,
            font: FONT,
          }),
        ],
      }),
    );

    for (let index = 0; index < block.body.length; index += 1) {
      const line = block.body[index];
      const hasMarker = /^[-•·]\s*/.test(line);
      const content = stripMarkdown(line.replace(/^[-•·]\s*/, ""));

      const parts = hasMarker || isProseBlock ? null : splitEntryParts(content);

      if (parts) {
        const boldRun = (value: string) =>
          new TextRun({ text: value, bold: true, size: layout.entry, font: FONT });

        /** 教育条目按需求单排四列：学校 / 院系｜专业 / 起止 / 学历。 */
        let middleText = parts.middle;
        let degree = parts.extra;
        if (isEducation && !degree) {
          // 草稿写成「商学院｜应用经济学硕士」时，把学历拆出来单独占最后一列。
          const matched = /^(.*?)(本科|硕士|博士|研究生|专科)$/.exec(middleText);
          if (matched && matched[1].trim()) {
            middleText = matched[1].trim();
            degree = matched[2];
          }
        }

        const entryRuns: InstanceType<typeof TextRun>[] = [boldRun(parts.left)];
        if (middleText) entryRuns.push(tab(), boldRun(middleText));
        entryRuns.push(tab(), boldRun(parts.date));
        if (isEducation && degree) entryRuns.push(tab(), boldRun(degree));

        children.push(
          new Paragraph({
            spacing: { line: layout.line, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
            widowControl: false,
            /** 没有学历那一列时退回三段式，日期仍然停在 18.4 cm 右端。 */
            tabStops: (isEducation && degree ? EDUCATION_TABS : ENTRY_TABS).map((item) => ({
              type: item.type === "center" ? TabStopType.CENTER : TabStopType.RIGHT,
              position: item.position,
            })),
            children: entryRuns,
          }),
        );
        continue;
      }

      const datelessHeader =
        !hasMarker && !isProseBlock && /^[-•·]\s*/.test(block.body[index + 1] ?? "");
      if (datelessHeader) {
        children.push(
          new Paragraph({
            spacing: { line: layout.line, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
            widowControl: false,
            children: [new TextRun({ text: content, bold: true, size: layout.entry, font: FONT })],
          }),
        );
        continue;
      }

      const asBullet = hasMarker || !isProseBlock;

      let bodyRuns: InstanceType<typeof TextRun>[] = [];
      if (hasHints(content)) {
        bodyRuns = runsOf(content, { size: layout.body });
      } else {
        const label = asBullet ? splitLabel(content) : null;
        bodyRuns = label
          ? [
              new TextRun({ text: `${label.label}：`, bold: true, size: layout.body, font: FONT }),
              new TextRun({ text: label.rest, size: layout.body, font: FONT }),
            ]
          : [new TextRun({ text: content, size: layout.body, font: FONT })];
      }

      children.push(
        new Paragraph({
          alignment: asBullet ? AlignmentType.JUSTIFIED : undefined,
          spacing: { line: layout.line, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
          widowControl: false,
          ...(asBullet ? { indent: { left: BULLET_INDENT, hanging: BULLET_INDENT } } : {}),
          children: asBullet
            ? [new TextRun({ text: "• ", size: layout.body, font: FONT }), ...bodyRuns]
            : bodyRuns,
        }),
      );
    }
  }

  if (children.length === 0) {
    throw new Error("简历草稿是空的，没有可导出的内容。");
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: MARGIN_TOP, right: MARGIN_SIDE, bottom: MARGIN_BOTTOM, left: MARGIN_SIDE },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}
