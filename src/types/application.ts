import type { ResumeData } from "@/types/analysis";

/**
 * 看板列就是招聘阶段，按投递推进的顺序排列。
 *
 * 早期版本把「投递状态」和「招聘阶段」拆成两个字段，
 * 旧数据在加载时由 store 里的 normalizeApplication 迁到这里，不再保留第二个字段。
 */
export const APPLICATION_STATUSES = [
  "待投递",
  "已投递",
  "笔试",
  "面试",
  "Offer",
  "已结束",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type ApplicationEvent = {
  id: string;
  at: string;
  type: "created" | "status" | "stage" | "updated";
  description: string;
};

export type Application = {
  id: string;
  company: string;
  title: string;
  status: ApplicationStatus;
  note: string;
  jobUrl: string;
  jdId: string;
  resumeVariantId: string;
  nextAction: string;
  deadline: string;
  blocker: string;
  createdAt: string;
  updatedAt: string;
  timeline: ApplicationEvent[];
};

export type ApplicationDraft = Pick<Application, "company" | "title"> &
  Partial<Omit<Application, "id" | "company" | "title" | "timeline" | "createdAt" | "updatedAt">>;

export type ResumeVariant = {
  id: string;
  name: string;
  /** 对应 career.ts 中的方向 id。 */
  directionId: string;
  /** 兼容第一版数据，读取后会自动映射为 directionId。 */
  targetRole?: string;
  sourceText: string;
  /** 保存该版本时的结构化解析结果，供网申资料包和扩展填写使用。 */
  structuredData?: ResumeData;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AnswerBankEntry = {
  id: string;
  question: string;
  answer: string;
  confirmed: boolean;
  updatedAt: string;
};
