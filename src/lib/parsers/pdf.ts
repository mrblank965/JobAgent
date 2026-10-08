/**
 * 成员 B 负责：从 PDF 文件中提取文字。
 * 这里故意不返回假数据；接入 PDF 解析库后再替换实现。
 */
export async function extractTextFromPdf(_file: File): Promise<string> {
  void _file;
  throw new Error("PDF 解析器尚未实现");
}
