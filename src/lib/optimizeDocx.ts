import { cleanTitle, isSectionTitle, stripMarkdown } from "@/lib/optimize";
import { hasHints, stripHints, tokenizeHints } from "@/lib/resumeTemplate";

/**
 * 把简历正文排成一份 Word 文档。
 *
 * 版式：
 * - A4 纸（11906 × 16838 twip），四边边距 1000 twip ≈ 1.76 cm
 * - 西文与数字 Times New Roman，中文宋体，全文黑色
 * - 固定行距、段前段后 0（姓名行、联系方式行例外）
 * - 姓名加粗居中；联系方式居中；一级标题加粗 + 下框线 0.5 磅 #666666
 * - 条目标题行用制表位做「左 / 中 / 右」三段对齐，不用空格凑
 * - 要点行以「• 」开头，悬挂缩进，小标题加粗
 *
 * 一页装不下时有三档密度（见 LAYOUTS）：
 * strict 是需求单上的原始参数，compact / tight 只收紧字号和行距，
 * 不删任何内容。选哪一档由页面上的「自动压缩到一页」决定。
 *
 * 几条实现上的取舍：
 * 1. 模板提示（〔〕里的字）原来是灰色，需求要求「全文不使用任何彩色文字」，
 *    改成黑色斜体——仍然能和正文区分，但不违反黑白要求。
 * 2. 教育条目原本拆成「学校 / 院系｜专业 / 起止 / 学历」四段，四列挤在一行
 *    不好看，现在把学历并进中间那段，写法是「商学院 · 经济学硕士」。
 * 3. 能否压进一页靠 estimateDocxLines 估算，不是真的排版渲染，
 *    估算时按 88% 折行、再留 4% 高度余量，宁可提前收紧也不让它溢出到第二页。
 */

/** A4 尺寸，单位 twip（1 磅 = 20 twip）：210 × 297 mm。 */
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;

/** 页边距四边都是 1000 twip ≈ 1.76 cm。 */
const MARGIN_TOP = 1000;
const MARGIN_BOTTOM = 1000;
const MARGIN_SIDE = 1000;

/** 正文可用高度与宽度（宽度单位：磅）。 */
const AVAILABLE_HEIGHT = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
const TEXT_WIDTH_PT = (PAGE_WIDTH - MARGIN_SIDE * 2) / 20;

/**
 * 折行安全系数。
 *
 * Word 会在标点和西文单词处断行，实际每行装的字比"理论最大字数"少一两成。
 * 按 0.88 折算，宁可估多了提前压缩，也不要估少了导出成两页。
 */
const WRAP_SAFETY = 0.88;

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
 * 制表位，单位 twip。正文宽度 11906-2000=9906，所以右端停在 9906。
 * 中间那条放在 6200，比正中偏右一点，留给左边的公司名。
 */
const ENTRY_TABS = [
  { type: "center" as const, position: 6200 },
  { type: "right" as const, position: 9906 },
];

/** 要点行的悬挂缩进：0.38 cm ≈ 215 twip。 */
const BULLET_INDENT = 215;

/** 中文用宋体，西文和数字用 Times New Roman（eastAsia 必须单列，否则中文会被西文字体渲染）。 */
const FONT = { ascii: "Times New Roman", hAnsi: "Times New Roman", eastAsia: "宋体" };

/** 可选板块的标题尾巴，例如「校园经历（可选择）」。 */
const OPTIONAL_TITLE = /[（(]\s*可选择?\s*[）)]$/;

const PROSE_SECTIONS = ["个人优势", "自我评价", "个人总结"];

export type DocxDensity = "strict" | "compact" | "tight";

/**
 * 三档密度。字号单位半磅，行距单位 twip。
 * strict 就是需求单上的原始参数，另外两档只在超页时启用。
 */
export const LAYOUTS: Record<
  DocxDensity,
  { body: number; entry: number; heading: number; name: number; contact: number; line: number; nameLine: number }
> = {
  strict: { body: 21, entry: 21, heading: 24, name: 32, contact: 21, line: 280, nameLine: 400 },
  compact: { body: 20, entry: 20, heading: 23, name: 30, contact: 20, line: 262, nameLine: 380 },
  tight: { body: 19, entry: 19, heading: 21, name: 28, contact: 19, line: 244, nameLine: 340 },
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

/** 估算一行文字占多宽（磅）。中文按一个字宽，西文按 0.55。 */
function textWidthPt(value: string, sizePt: number): number {
  let width = 0;
  for (const char of value) {
    width += /[⺀-鿿　-〿＀-￯]/.test(char) ? sizePt : sizePt * 0.55;
  }
  return width;
}

/**
 * 估算这份草稿排出来要多少行、一页能放多少行。
 *
 * 不是真的渲染排版，是按字数折算折行，准确度到"±2 行"这个量级，
 * 够用来判断要不要切到紧凑档。
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

/** 从 strict 开始逐档收紧，返回第一个装得下的档位；都装不下就用最紧的。 */
export function pickDocxDensity(text: string): DocxDensity {
  for (const density of ["strict", "compact", "tight"] as DocxDensity[]) {
    if (estimateDocxLines(text, density).fits) return density;
  }
  return "tight";
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
        // 教育条目原来把「学历」单独塞到最右一列，四段挤在一行很别扭，
        // 现在并进中间那一段，写成「商学院 · 经济学硕士」。
        const middleText = isEducation && parts.extra
          ? [parts.middle, parts.extra].filter(Boolean).join(" · ")
          : parts.middle;

        const entryRuns: InstanceType<typeof TextRun>[] = [
          new TextRun({ text: parts.left, bold: true, size: layout.entry, font: FONT }),
        ];
        if (middleText) {
          entryRuns.push(tab(), new TextRun({ text: middleText, bold: true, size: layout.entry, font: FONT }));
        }
        entryRuns.push(tab(), new TextRun({ text: parts.date, bold: true, size: layout.entry, font: FONT }));

        children.push(
          new Paragraph({
            spacing: { line: layout.line, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
            widowControl: false,
            tabStops: ENTRY_TABS.map((item) => ({
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
