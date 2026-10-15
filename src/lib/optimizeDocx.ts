import { SECTION_TITLES, stripMarkdown } from "@/lib/optimize";
import { hasHints, stripHints, tokenizeHints } from "@/lib/resumeTemplate";

/**
 * 把简历正文排成一份 Word 文档。
 *
 * 五条原则：
 * 1. 尽量压在一页。A4、页边距收紧、行距取偏紧的值。但最终分几页是 Word 自己
 *    按内容长度算的，代码无法事先知道，所以只能"尽量紧"，不能保证"刚好一页"。
 * 2. 中文字体单独设 eastAsia，否则 Word 会用西文字体渲染中文，很难看。
 * 3. 拉开层次。经历表头（以日期开头那行）把日期挪到行尾右对齐，公司职位留在左边；
 *    要点行默认带项目符号，如果写成「小标题：内容」，把冒号前的部分加粗。
 *    「个人优势」这类整段话的板块例外，见 PROSE_SECTIONS。
 * 4. 模板提示（写在〔〕里的字）渲染成灰色斜体，跟黑色正文分开，用户一看就知道哪里要自己改。
 *    传 stripHints 导出时会把提示全部清掉，得到一份可以直接投递的干净版本。
 * 5. 版面密度。同一条要点内紧凑，不同经历之间留白，一页能多放内容。
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
/** 模板提示的灰色。黑白的正文里只有它是有颜色的，一眼能认出来。 */
const HINT_COLOR = "808080";

/** 去掉行首行尾的 【】 [] 和冒号，用来比对板块标题。 */
function cleanTitle(line: string): string {
  return line.trim().replace(/^[【\[]+/, "").replace(/[】\]]+$/, "").replace(/[:：]\s*$/, "").trim();
}

function isSectionTitle(line: string): boolean {
  const title = cleanTitle(line);
  return SECTION_TITLES.some((item) => title === item);
}

/**
 * 这几个板块在简历里通常是一整段话，不是一条条并列的要点。
 * 硬排成带项目符号的要点反而奇怪，所以保留成普通段落。
 * 用户明确写了「- 」的，仍然按要点排。
 */
const PROSE_SECTIONS = ["个人优势", "自我评价", "个人总结"];

/**
 * 把经历表头拆成「日期」和「其余内容」。
 * 例如「2025.06—2025.09  星河证券  投行部实习生」→ 日期 2025.06—2025.09，其余 星河证券  投行部实习生。
 * 开头不是日期的返回 null。
 */
export function splitEntryHeader(line: string): { date: string; rest: string } | null {
  const matched = /^(\d{4}(?:[.\-/年]\d{1,2})?(?:\s*[—~至\-]\s*\d{4}(?:[.\-/年]\d{1,2})?)?)[\s　]+(.+)$/.exec(line.trim());
  if (!matched) return null;

  let date = matched[1].trim();
  let rest = matched[2].trim();

  // 「2023 年校级一等奖学金」会被拆成日期 2023 + 年校级一等奖学金，
  // 那个「年」字孤零零留在左边，读起来是断的。日期只有年份时，把紧跟的「年」并回去，
  // 排出来就是「校级一等奖学金 …… 2023 年」，这才是获奖栏该有的样子。
  // 排除「年份」这种词，免得把「2023 年份统计」误切。
  if (/^\d{4}$/.test(date) && rest.startsWith("年") && !rest.startsWith("年份") && rest.length > 1) {
    date = `${date} 年`;
    rest = rest.slice(1).trim();
  }

  return { date, rest };
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
export async function buildResumeDocx(
  text: string,
  options: { stripHints?: boolean } = {},
): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, BorderStyle, LineRuleType, TabStopType, Tab } = await import("docx");

  /**
   * 把一行切成若干 run。
   *
   * 带〔〕的是模板提示，渲染成灰色斜体，跟黑色正文分开，用户一眼看得出哪里是要自己改的。
   * 其余部分正常颜色。
   */
  const runsOf = (
    content: string,
    base: { bold?: boolean; size: number; font: typeof FONT },
  ): InstanceType<typeof TextRun>[] => {
    if (!hasHints(content)) {
      return [new TextRun({ text: content, bold: base.bold, size: base.size, font: base.font })];
    }

    return tokenizeHints(content)
      .filter((token) => token.text.length > 0)
      .map((token) =>
        token.hint
          ? new TextRun({
              text: token.text,
              italics: true,
              color: HINT_COLOR,
              size: base.size,
              font: base.font,
            })
          : new TextRun({ text: token.text, bold: base.bold, size: base.size, font: base.font }),
      );
  };

  // 勾了「去掉灰色提示」就先清一遍，得到一份没有多余文字的正式简历。
  const source = options.stripHints ? stripHints(text) : text;
  const { name, contact, blocks } = parseResumeText(source);
  const children: InstanceType<typeof Paragraph>[] = [];

  if (name) {
    children.push(
      new Paragraph({
        alignment: "center",
        spacing: { after: contact ? 40 : 180 },
        children: runsOf(name, { bold: true, size: NAME_SIZE, font: FONT_BOLD }),
      }),
    );
  }

  if (contact) {
    children.push(
      new Paragraph({
        alignment: "center",
        spacing: { after: 180 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: LINE_COLOR } },
        children: runsOf(contact, { size: CONTACT_SIZE, font: FONT }),
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
      /** 行首带了项目符号标记，说明这一行本来就是要点。 */
      const hasMarker = /^[-•·]\s*/.test(line);
      // 万一带上了 markdown 星号（模型有时会自作主张加），这里再剥一次，
      // 保证 Word 里不会印出 ** 这种符号。加粗交给下面按「小标题：」判断。
      const content = stripMarkdown(line.replace(/^[-•·]\s*/, ""));

      // 经历表头：没有符号、而且以日期开头的那一行。日期顶到右边界，公司职位留在左边。
      if (!hasMarker) {
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
      let runs: InstanceType<typeof TextRun>[];

      if (hasHints(content)) {
        // 带模板提示的行不套「小标题加粗」那套规则，整行按灰/黑切开就行，
        // 免得把括号里的说明文字也当成小标题加粗了。
        runs = runsOf(content, { size: BODY_SIZE, font: FONT });
      } else {
        const label = splitLabel(content);
        runs = label
          ? [
              new TextRun({ text: `${label.label}：`, bold: true, size: BODY_SIZE, font: FONT_BOLD }),
              new TextRun({ text: label.rest, size: BODY_SIZE, font: FONT }),
            ]
          : [new TextRun({ text: content, size: BODY_SIZE, font: FONT })];
      }

      // 排成要点还是普通段落。
      //
      // 以前只看行首有没有「-」，可 Prompt 从来没有要求模型写这个符号，
      // 模型不写，整段经历就排成一坨没有层次的平铺文字。
      // 现在改成默认按要点排：简历的正文单位本来就是一条条要点，
      // 靠"模型记不记得打符号"来决定排版太不可靠。
      // 例外是「个人优势」这类整段话的板块，见 PROSE_SECTIONS。
      const asBullet = hasMarker || !PROSE_SECTIONS.includes(cleanTitle(block.title));

      children.push(
        new Paragraph({
          ...(asBullet ? { bullet: { level: 0 } } : {}),
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
