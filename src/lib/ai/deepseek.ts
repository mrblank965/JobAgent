import type { AIMessage, AIProvider } from "./provider";

/**
 * 成员 C 负责：只在服务端使用 DeepSeek Key 调用模型。
 * 不要在浏览器组件中读取密钥，也不要给变量加 NEXT_PUBLIC_ 前缀。
 */
export function createDeepSeekProvider(): AIProvider {
  return {
    name: "deepseek",
    async complete(_messages: AIMessage[]) {
      void _messages;
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error("缺少 DEEPSEEK_API_KEY，请先配置 .env.local");
      }

      throw new Error("DeepSeek 请求尚未实现");
    },
  };
}
