/**
 * 把粘贴进来的面试题库文本切成一条条题目。
 *
 * 招聘群里流传的题库通常是这几种写法混着来：
 *   "1. 自我介绍"  "2、为什么选我们"  "（1）讲一次失败"  "一、你怎么看加班"
 * 也有的干脆一行一题。
 *
 * 规则：**一行一题**是默认，只有两种例外会并到上一题：
 * - 上一行明显没说完（以逗号、顿号、冒号、分号或左括号结尾）；
 * - 当前行是空白行。
 * 编号开头的行一定会另起一题，编号本身会被去掉。
 */
const NUMBER_PREFIX = /^(?:\d+\s*[.、)）]|[（(]\s*\d+\s*[)）]|[一二三四五六七八九十]+\s*[、.])\s*/;

/** 行尾是这些符号，说明这句话还没说完，下一行属于同一题。 */
const CONTINUES = /[，,、：:；;（(]$/;

export function splitQuestions(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const result: string[] = [];
  let buffer = "";

  const flush = () => {
    const value = buffer.trim();
    if (value) result.push(value);
    buffer = "";
  };

  for (const line of lines) {
    if (NUMBER_PREFIX.test(line)) {
      flush();
      buffer = line.replace(NUMBER_PREFIX, "");
      continue;
    }

    if (!buffer) {
      buffer = line;
      continue;
    }

    if (CONTINUES.test(buffer)) {
      buffer = `${buffer} ${line}`;
      continue;
    }

    flush();
    buffer = line;
  }

  flush();

  return result;
}
