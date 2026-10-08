import { createDeepSeekProvider } from "./deepseek";

export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIProvider = {
  name: string;
  complete(messages: AIMessage[]): Promise<string>;
};

/**
 * 统一 AI 接口：以后从 DeepSeek 换成其他模型时，页面和匹配模块不需要重写。
 */
export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? "deepseek";

  if (provider === "deepseek") {
    return createDeepSeekProvider();
  }

  throw new Error(`暂不支持 AI_PROVIDER=${provider}`);
}
