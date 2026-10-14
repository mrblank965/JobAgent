import { SECTION_TITLES, stripMarkdown } from "@/lib/optimize";

/**
 * 把简历正文排成一份 Word 文档。
 *
 * 四条原则：
 * 1. 尽量压在一页。A4、页边距收紧、行距取偏紧的值。但最终分几页是 Word 自己
 *    按内容长度算的，代码无法事先知道，所以只能"尽量紧"，不能保证"刚好一页"。
 * 2. 中文字体单独设 eastAsia，否则 Word 会用西文字体渲染中文，很难看。
 * 3. 拉开层次。经历表头（以日期开头那行）把日期挪到行尾右对齐，公司职位留在左边；
 *    要点行如果写成「小标题：内容」，把冒号前的部分加粗。
 * 4. 版面密度。同一条要点内紧凑，不同经历之间留白，一页能多放内容。
 */

/** A4 尺寸，单位是 twip（1 磅 = 20 twip）。210mm × 297mm。 */
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16839;

/** 页边距，1000 twip ≈ 1.76 厘米，比 Word 默认的两侧 3.18 厘米紧一些。 */
const MARGIN = 1000;

/** 正文可用宽度，用来把日期顶到右边界。 */
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** 字号单位是半磅：21 = 10.5 磅。 */
const BODY_SIZE = 21;
const ENTRY_SIZE = 22;
const HEADING_SIZE = 24;
const NAME_SIZE = 36;
const CONTACT_SIZE = 19;

const FONT = { ascii: "宋体", eastAsia: "宋体", hAnsi: "宋体" };
const FONT_BOLD = { ascii: "黑体", eastAsia: "黑体", hAnsi: "黑体" };
const LINE_COLOR = "595959";

/** 去掉行首行尾的 【】 [] 和冒号，用来比对板块标题。 */
function cleanTitle(line: string): string {
  return line.trim().replace(/^[【\[]+/, "").replace(/[】\]]+$/, "").replace(/[:：]\s*$/, "").trim();
}

function isSectionTitle(line: string): boolean {
  const title = cleanTitle(line);
  return SECTION_TITLES.some((item) => title === item);
}

/**
 * 把经历表头拆成「日期」和「其余内容」。
 * 例如「2025.06—2025.09  星河证券  投行部实习生」→ 日期 2025.06—2025.09，其余 星河证券  投行部实习生。
 * 开头不是日期的返回 null。
 */
export function splitEntryHeader(line: string): { date: string; rest: string } | null {
  const matched = /^(\d{4}(?:[.\-/年]\d{1,2})?(?:\s*[—~至\-]\s*\d{4}(?:[.\-/年]\d{1,2})?)?)[\s　]+(.+)$/.exec(line.trim());
  if (!matched) return null;
  return { date: matched[1].trim(), rest: matched[2].trim() };
}

/** 把「小标题：内容」拆开。冒号前不超过 12 个字才算小标题，否则当普通句子。 */
export function splitLabel(text: string): { label: string; rest: string } | null {
  const matched = /^([^：:]{2,12})[：:]\s*(.+)$/.exec(text.trim());
  if (!matched) return null;
  return { label: matched[1].trim(), rest: matched[2].trim() };
}

type ResumeBlock = { title: string; body: string[] };

/**
 * 把纯文本简历拆成"姓名 + 联系方式 + 若干板块"。
 *
 * 简历正文是我们自己这一页拼出来的纯文本，格式比较规整，
 * 所以只要能认出板块标题就能正确分段，不需要动用解析器。
 */
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
      current = { title: cleanTitle(line), body: [] };
      blocks.push(current);
      continue;
    }

    if (!name) {
      name = line;
      continue;
    }

    // 姓名之后、第一个板块标题之前的内容，当作联系方式那一行。
    if (!current) {
      contactLines.push(line);
      continue;
    }

    current.body.push(line);
  }

  return { name, contact: contactLines.join("　　"), blocks };
}

/**
 * 生成 .docx 文件的二进制内容。
 *
 * docx 这个库只在这里用得到，所以用动态 import 按需加载：
 * 一是不会把它塞进页面首屏的代码包里，二是避免服务端渲染时碰到它内部
 * 只在 Node 下能跑的代码。
 */
export async function buildResumeDocx(text: string): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, BorderStyle, LineRuleType, TabStopType, Tab } = await import("docx");

  const { name, contact, blocks } = parseResumeText(text);
  const children: InstanceType<typeof Paragraph>[] = [];

  if (name) {
    children.push(
      new Paragraph({
        alignment: "center",
        spacing: { after: contact ? 40 : 180 },
        children: [new TextRun({ text: name, bold: true, size: NAME_SIZE, font: FONT_BOLD })],
      }),
    );
  }

  if (contact) {
    children.push(
      new Paragraph({
        alignment: "center",
        spacing: { after: 180 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: LINE_COLOR } },
        children: [new TextRun({ text: contact, size: CONTACT_SIZE, font: FONT })],
      }),
    );
  } else if (name) {
    // 没有联系方式时，用一条横线把姓名和正文分开。
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: LINE_COLOR } },
        children: [],
      }),
    );
  }

  for (const block of blocks) {
    children.push(
      new Paragraph({
        spacing: { before: 220, after: 90 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: LINE_COLOR } },
        children: [new TextRun({ text: block.title, bold: true, size: HEADING_SIZE, font: FONT_BOLD })],
      }),
    );

    for (const line of block.body) {
      const isBullet = /^[-•·]\s*/.test(line);
      // 万一带上了 markdown 星号（模型有时会自作主张加），这里再剥一次，
      // 保证 Word 里不会印出 ** 这种符号。加粗交给下面按「小标题：」判断。
      const content = stripMarkdown(line.replace(/^[-•·]\s*/, ""));

      // 经历表头：日期顶到右边界，公司职位留在左边。
      if (!isBullet) {
        const header = splitEntryHeader(content);
        if (header) {
          children.push(
            new Paragraph({
              spacing: { before: 130, after: 40 },
              tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
              children: [
                new TextRun({ text: header.rest, bold: true, size: ENTRY_SIZE, font: FONT_BOLD }),
                new TextRun({ children: [new Tab()] }),
                new TextRun({ text: header.date, size: BODY_SIZE, font: FONT }),
              ],
            }),
          );
          continue;
        }
      }

      // 要点行：写成「小标题：内容」时，冒号前加粗。
      const label = splitLabel(content);
      const runs = label
        ? [
            new TextRun({ text: `${label.label}：`, bold: true, size: BODY_SIZE, font: FONT_BOLD }),
            new TextRun({ text: label.rest, size: BODY_SIZE, font: FONT }),
          ]
        : [new TextRun({ text: content, size: BODY_SIZE, font: FONT })];

      children.push(
        new Paragraph({
          ...(isBullet ? { bullet: { level: 0 } } : {}),
          spacing: { line: 280, lineRule: LineRuleType.AUTO, after: 24 },
          children: runs,
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
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}
