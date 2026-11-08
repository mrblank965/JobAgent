"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  clearWorkspaceSnapshot,
  readWorkspaceSnapshot,
  writeWorkspaceSnapshot,
} from "@/lib/storage/workspace";
import {
  APPLICATION_STATUSES,
  type AnswerBankEntry,
  type Application,
  type ApplicationDraft,
  type ApplicationStatus,
  type ResumeVariant,
} from "@/types/application";
import { DIRECTIONS } from "@/lib/career";
import { splitQuestions } from "@/lib/interviewBank";
import type { RecognizedHeading } from "@/lib/parsers/resumeText";
import type { ResumeData } from "@/types/analysis";

export type { AnswerBankEntry, Application, ResumeVariant } from "@/types/application";

/**
 * 页面共享状态。个人资料与求职流程保存在浏览器 IndexedDB，AI 密钥只保留在内存。
 */

export type Profile = {
  name: string;
  email: string;
  phone: string;
  /** 性别：男 / 女 / 空。国内网申基本必填，插件的资料包会带上。 */
  gender: string;
  /** 出生日期，YYYY-MM-DD，可留空。 */
  birth: string;
  /** 政治面貌，取值见 POLITICAL_OPTIONS。 */
  political: string;
  location: string;
  workAuthorization: string;
  workAuthorizationConfirmed: boolean;
  /** 毕业年份。 */
  gradYear: string;
  school: string;
  major: string;
  /** 学历，取值见 DEGREE_OPTIONS。 */
  degree: string;
  /** 求职类型，取值见 JOB_TYPES。 */
  jobType: string;
  /** 目标方向，取值来自 career.ts 里那八个方向。 */
  target: string;
  /** 意向城市，可多选，取值见 CITY_OPTIONS。 */
  cities: string[];
  /** 小动物头像，取值见 ANIMAL_OPTIONS。 */
  avatar: string;
  skills: string[];
  strengths: string[];
  /** 学历概览，用于展示，不参与计算。 */
  education: string;
  /** 简历原文，用于 JD 比对时找命中证据，以及简历定制里改写。 */
  rawResume: string;
};

/** 学历下拉选项。 */
export const DEGREE_OPTIONS = ["本科", "硕士", "博士", "MBA", "专科", "其他"];

/** 性别与政治面貌的可选值，与简历助手插件的下拉项保持一致。 */
export const GENDER_OPTIONS = ["男", "女"];
export const POLITICAL_OPTIONS = ["群众", "共青团员", "中共预备党员", "中共党员", "民主党派", "无党派人士"];

/** 求职类型选项。 */
export const JOB_TYPES = ["校招", "实习", "社招"];

/** 意向城市选项，点一下选中，再点取消。 */
export const CITY_OPTIONS = [
  "北京",
  "上海",
  "深圳",
  "广州",
  "杭州",
  "南京",
  "成都",
  "武汉",
  "苏州",
  "香港",
  "天津",
  "西安",
  "重庆",
  "长沙",
  "青岛",
  "厦门",
  "合肥",
  "济南",
  "宁波",
  "大连",
];

/** 小动物头像选项。 */
export const ANIMAL_OPTIONS = [
  "🦊",
  "🐼",
  "🐨",
  "🐯",
  "🦁",
  "🐧",
  "🦉",
  "🐬",
  "🐙",
  "🦄",
  "🐺",
  "🐻",
];

/** AI 接入配置。只在页面内存里，不写 localStorage。 */
export type QuestionLevel = "new" | "practicing" | "mastered";

export type AISettings = {
  apiBase: string;
  apiKey: string;
  model: string;
};

export type JDEntry = {
  id: string;
  company: string;
  title: string;
  raw: string;
  keywords: string[];
  /** 这份 JD 属于哪个求职方向（对应 career.ts 的 DIRECTIONS.id）。空串表示未指定。 */
  directionId?: string;
};

export type InterviewRecord = {
  id: string;
  company: string;
  title: string;
  /** 分组名到问答列表。 */
  groups: Record<string, { q: string; a: string }[]>;
};

export type ResumeDraft = {
  text: string;
  fileName: string;
  resume: ResumeData | null;
  headings: RecognizedHeading[];
  suspectedHeadings: string[];
};

export const STATUSES = APPLICATION_STATUSES;

type StoreValue = {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  jds: JDEntry[];
  addJD: (entry: Omit<JDEntry, "id">) => string;
  removeJD: (id: string) => void;
  updateJD: (id: string, patch: Partial<Omit<JDEntry, "id">>) => void;
  apps: Application[];
  addApp: (entry: ApplicationDraft) => void;
  moveApp: (id: string, status: ApplicationStatus) => void;
  updateApp: (id: string, patch: Partial<Omit<Application, "id" | "timeline" | "createdAt">>) => void;
  updateAppNote: (id: string, note: string) => void;
  removeApp: (id: string) => void;
  resumeVariants: ResumeVariant[];
  addResumeVariant: (
    entry: Pick<ResumeVariant, "name" | "directionId" | "sourceText"> & Pick<Partial<ResumeVariant>, "structuredData">,
  ) => string;
  updateResumeVariant: (
    id: string,
    patch: Partial<Pick<ResumeVariant, "name" | "directionId" | "sourceText" | "structuredData" | "isDefault">>,
  ) => void;
  removeResumeVariant: (id: string) => void;
  answerBank: AnswerBankEntry[];
  addAnswer: (entry: Pick<AnswerBankEntry, "question" | "answer" | "confirmed">) => void;
  updateAnswer: (id: string, patch: Partial<Pick<AnswerBankEntry, "question" | "answer" | "confirmed">>) => void;
  removeAnswer: (id: string) => void;
  resumeDraft: ResumeDraft;
  setResumeDraft: Dispatch<SetStateAction<ResumeDraft>>;
  storageReady: boolean;
  storageError: string;
  exportWorkspace: () => string;
  importWorkspace: (raw: string) => { ok: true } | { ok: false; error: string };
  clearWorkspace: () => Promise<void>;
  interviews: InterviewRecord[];
  ensureInterview: (app: Application) => void;
  setInterviewAnswer: (id: string, group: string, index: number, answer: string) => void;
  /** 全局题库：导入一次，所有面试记录共用。 */
  customQuestions: { q: string; a: string; level?: QuestionLevel }[];
  importQuestions: (text: string) => number;
  setQuestionLevel: (index: number, level: QuestionLevel) => void;
  setCustomAnswer: (index: number, answer: string) => void;
  removeCustomQuestion: (index: number) => void;
  ai: AISettings;
  setAI: (next: AISettings) => void;
};

const emptyProfile: Profile = {
  name: "",
  email: "",
  phone: "",
  gender: "",
  birth: "",
  political: "",
  location: "",
  workAuthorization: "",
  workAuthorizationConfirmed: false,
  gradYear: "",
  school: "",
  major: "",
  degree: "本科",
  jobType: "校招",
  target: "",
  cities: [],
  avatar: "",
  skills: [],
  strengths: [],
  education: "",
  rawResume: "",
};

const emptyAI: AISettings = { apiBase: "https://api.deepseek.com/v1", apiKey: "", model: "deepseek-chat" };

const emptyResumeDraft: ResumeDraft = {
  text: "",
  fileName: "",
  resume: null,
  headings: [],
  suspectedHeadings: [],
};

const WORKSPACE_SCHEMA_VERSION = 1;

type WorkspaceSnapshot = {
  schemaVersion: number;
  profile: Profile;
  jds: JDEntry[];
  apps: Application[];
  interviews: InterviewRecord[];
  resumeVariants: ResumeVariant[];
  answerBank: AnswerBankEntry[];
  resumeDraft?: ResumeDraft;
  /** AI 接入配置。旧快照里没有这个字段，读到时保持默认值。 */
  ai?: AISettings;
  /** 全局面试题库，旧快照里没有这个字段，读到时按空数组处理。 */
  customQuestions?: { q: string; a: string; level?: QuestionLevel }[];
};

const StoreContext = createContext<StoreValue | null>(null);

/** 简单的自增 id，只在页面内存里有效，不需要全局唯一。 */
let seq = 0;
const uid = (prefix: string) => `${prefix}_${(seq += 1)}_${Date.now().toString(36)}`;

const now = () => new Date().toISOString();

function createApplication(entry: ApplicationDraft): Application {
  const createdAt = now();
  return {
    id: uid("app"),
    company: entry.company,
    title: entry.title,
    status: entry.status ?? "待投递",
    note: entry.note ?? "",
    jobUrl: entry.jobUrl ?? "",
    jdId: entry.jdId ?? "",
    resumeVariantId: entry.resumeVariantId ?? "",
    nextAction: entry.nextAction ?? "",
    deadline: entry.deadline ?? "",
    blocker: entry.blocker ?? "",
    createdAt,
    updatedAt: createdAt,
    timeline: [
      { id: uid("event"), at: createdAt, type: "created", description: "创建申请记录" },
    ],
  };
}

function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WorkspaceSnapshot>;
  return (
    item.schemaVersion === WORKSPACE_SCHEMA_VERSION &&
    !!item.profile &&
    Array.isArray(item.jds) &&
    Array.isArray(item.apps) &&
    Array.isArray(item.interviews) &&
    Array.isArray(item.resumeVariants) &&
    Array.isArray(item.answerBank)
  );
}

function normalizeResumeVariant(item: ResumeVariant): ResumeVariant {
  const legacyDirection = DIRECTIONS.find((direction) => direction.name === item.targetRole);
  return {
    ...item,
    directionId: item.directionId || legacyDirection?.id || "",
  };
}

/**
 * 旧记录同时有 status（投递状态）和 stage（招聘阶段）两个字段，
 * 现在合并成一个 status。迁移时按推进程度取更靠后的那个阶段。
 */
function normalizeApplication(item: Application): Application {
  const legacy = item as Application & { stage?: string };
  // 旧记录一定带 stage 字段；新记录没有。不能只看 status，
  // 因为「待投递」「已投递」这两个值新旧两套都有。
  const hasLegacyStage = Object.prototype.hasOwnProperty.call(legacy, "stage");
  const knownStatus = (APPLICATION_STATUSES as readonly string[]).includes(item.status);

  if (!hasLegacyStage && knownStatus) return item;

  let status: ApplicationStatus = "待投递";
  if (legacy.status === "已结束") status = "已结束";
  else if (legacy.stage === "Offer") status = "Offer";
  else if (legacy.stage === "面试") status = "面试";
  else if (legacy.stage === "笔试") status = "笔试";
  else if (knownStatus) status = item.status;

  const next = { ...legacy, status };
  delete next.stage;
  return next;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [jds, setJds] = useState<JDEntry[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [interviews, setInterviews] = useState<InterviewRecord[]>([]);
  const [resumeVariants, setResumeVariants] = useState<ResumeVariant[]>([]);
  const [answerBank, setAnswerBank] = useState<AnswerBankEntry[]>([]);
  const [resumeDraft, setResumeDraftState] = useState<ResumeDraft>(emptyResumeDraft);
  const resumeDraftEditedBeforeLoad = useRef(false);
  const setResumeDraft = useCallback<Dispatch<SetStateAction<ResumeDraft>>>((next) => {
    resumeDraftEditedBeforeLoad.current = true;
    setResumeDraftState(next);
  }, []);
  const [customQuestions, setCustomQuestions] = useState<{ q: string; a: string; level?: QuestionLevel }[]>([]);
  const [ai, setAI] = useState<AISettings>(emptyAI);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    let cancelled = false;

    readWorkspaceSnapshot()
      .then((stored) => {
        if (cancelled || !isWorkspaceSnapshot(stored)) return;
        setProfile({ ...emptyProfile, ...stored.profile });
        setJds(stored.jds);
        setApps(stored.apps.map(normalizeApplication));
        setInterviews(stored.interviews);
        setResumeVariants(stored.resumeVariants.map(normalizeResumeVariant));
        setAnswerBank(stored.answerBank);
        setCustomQuestions(stored.customQuestions ?? []);
        if (stored.ai) setAI({ ...emptyAI, ...stored.ai });
        if (!resumeDraftEditedBeforeLoad.current) {
          setResumeDraftState(stored.resumeDraft ?? emptyResumeDraft);
        }
      })
      .catch(() => {
        if (!cancelled) setStorageError("本地数据读取失败，本次修改可能无法保留。");
      })
      .finally(() => {
        if (!cancelled) setStorageReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot = useMemo<WorkspaceSnapshot>(
    () => ({
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      profile,
      jds,
      apps,
      interviews,
      resumeVariants,
      answerBank,
      resumeDraft,
      customQuestions,
      ai,
    }),
    [profile, jds, apps, interviews, resumeVariants, answerBank, resumeDraft, customQuestions, ai],
  );

  useEffect(() => {
    if (!storageReady) return;
    const timer = window.setTimeout(() => {
      writeWorkspaceSnapshot(snapshot).catch(() => {
        setStorageError("本地数据保存失败，请先导出备份。");
      });
    }, 200);

    return () => window.clearTimeout(timer);
  }, [snapshot, storageReady]);

  const value = useMemo<StoreValue>(() => {
    return {
      profile,
      setProfile,

      jds,
      addJD(entry) {
        const id = uid("jd");
        setJds((current) => [...current, { ...entry, id }]);
        return id;
      },
      removeJD(id) {
        setJds((current) => current.filter((item) => item.id !== id));
      },
      updateJD(id, patch) {
        setJds((current) =>
          current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        );
      },

      apps,
      addApp(entry) {
        // 简历版本只认调用方显式传入的那一份，不猜、不兜底成默认版本。
        setApps((current) => [...current, createApplication(entry)]);
      },
      moveApp(id, status) {
        const target = apps.find((item) => item.id === id);
        setApps((current) =>
          current.map((item) => {
            if (item.id !== id || item.status === status) return item;
            const updatedAt = now();
            return {
              ...item,
              status,
              updatedAt,
              timeline: [
                ...item.timeline,
                { id: uid("event"), at: updatedAt, type: "status", description: `阶段更新为「${status}」` },
              ],
            };
          }),
        );

        // 进入面试阶段就准备练习题，和以前在详情里改招聘阶段是同一个效果。
        if (status === "面试" && target) {
          setInterviews((current) =>
            current.some((item) => item.id === target.id)
              ? current
              : [
                  ...current,
                  {
                    id: target.id,
                    company: target.company,
                    title: target.title,
                    groups: buildInterviewGroups(target.company, target.title),
                  },
                ],
          );
        }
      },
      updateApp(id, patch) {
        setApps((current) =>
          current.map((item) =>
            item.id === id ? { ...item, ...patch, updatedAt: now() } : item,
          ),
        );
      },
      updateAppNote(id, note) {
        setApps((current) => current.map((item) => (item.id === id ? { ...item, note } : item)));
      },
      removeApp(id) {
        setApps((current) => current.filter((item) => item.id !== id));
        // 面试记录的 id 跟投递记录一一对应，投递删了，对应的练习题也一起删。
        setInterviews((current) => current.filter((item) => item.id !== id));
      },

      resumeVariants,
      addResumeVariant(entry) {
        const timestamp = now();
        // 先算出 id 再写状态，这样调用方能拿到新版本的 id 去做后续动作（比如加入投递）。
        const id = uid("resume");
        setResumeVariants((current) => [
          ...current,
          {
            ...entry,
            id,
            isDefault: current.length === 0,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ]);
        return id;
      },
      updateResumeVariant(id, patch) {
        setResumeVariants((current) =>
          current.map((item) => ({
            ...item,
            ...(patch.isDefault ? { isDefault: false } : {}),
          })).map((item) => (item.id === id ? { ...item, ...patch, updatedAt: now() } : item)),
        );
      },
      removeResumeVariant(id) {
        setResumeVariants((current) => {
          const next = current.filter((item) => item.id !== id);
          if (next.length > 0 && !next.some((item) => item.isDefault)) next[0] = { ...next[0], isDefault: true };
          return next;
        });
      },

      answerBank,
      addAnswer(entry) {
        setAnswerBank((current) => [...current, { ...entry, id: uid("answer"), updatedAt: now() }]);
      },
      updateAnswer(id, patch) {
        setAnswerBank((current) =>
          current.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: now() } : item)),
        );
      },
      removeAnswer(id) {
        setAnswerBank((current) => current.filter((item) => item.id !== id));
      },

      resumeDraft,
      setResumeDraft,

      storageReady,
      storageError,
      exportWorkspace() {
        return JSON.stringify(snapshot, null, 2);
      },
      importWorkspace(raw) {
        try {
          const imported: unknown = JSON.parse(raw);
          if (!isWorkspaceSnapshot(imported)) return { ok: false, error: "文件格式或版本不受支持。" };
          setProfile({ ...emptyProfile, ...imported.profile });
          setJds(imported.jds);
          setApps(imported.apps.map(normalizeApplication));
          setInterviews(imported.interviews);
          setResumeVariants(imported.resumeVariants.map(normalizeResumeVariant));
          setAnswerBank(imported.answerBank);
          setCustomQuestions(imported.customQuestions ?? []);
          if (imported.ai) setAI({ ...emptyAI, ...imported.ai });
          setResumeDraftState(imported.resumeDraft ?? emptyResumeDraft);
          return { ok: true };
        } catch {
          return { ok: false, error: "无法读取这个 JSON 文件。" };
        }
      },
      async clearWorkspace() {
        setProfile(emptyProfile);
        setJds([]);
        setApps([]);
        setInterviews([]);
        setResumeVariants([]);
        setAnswerBank([]);
        setCustomQuestions([]);
        setAI(emptyAI);
        setResumeDraftState(emptyResumeDraft);
        await clearWorkspaceSnapshot();
      },

      interviews,
      ensureInterview(app) {
        setInterviews((current) => {
          if (current.some((item) => item.id === app.id)) return current;
          return [
            ...current,
            {
              id: app.id,
              company: app.company,
              title: app.title,
              groups: buildInterviewGroups(app.company, app.title),
            },
          ];
        });
      },
      setInterviewAnswer(id, group, index, answer) {
        setInterviews((current) =>
          current.map((item) => {
            if (item.id !== id) return item;
            const list = item.groups[group] ?? [];
            return {
              ...item,
              groups: {
                ...item.groups,
                [group]: list.map((qa, qaIndex) => (qaIndex === index ? { ...qa, a: answer } : qa)),
              },
            };
          }),
        );
      },
      customQuestions,
      importQuestions(text) {
        const parsed = splitQuestions(text)
          .map((q) => q.trim())
          .filter(Boolean);

        // 先在函数体里算好再写状态，返回值才和实际新增数量一致。
        const known = new Set(customQuestions.map((item) => item.q));
        const added: { q: string; a: string }[] = [];
        for (const q of parsed) {
          if (known.has(q)) continue;
          known.add(q);
          added.push({ q, a: "" });
        }
        if (added.length > 0) {
          setCustomQuestions((current) => [...current, ...added]);
        }
        return added.length;
      },
      setCustomAnswer(index, answer) {
        setCustomQuestions((current) =>
          current.map((item, itemIndex) => (itemIndex === index ? { ...item, a: answer } : item)),
        );
      },
      removeCustomQuestion(index) {
        setCustomQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index));
      },
      setQuestionLevel(index, level) {
        setCustomQuestions((current) =>
          current.map((item, itemIndex) => (itemIndex === index ? { ...item, level } : item)),
        );
      },

      ai,
      setAI,
    };
  }, [profile, jds, apps, interviews, resumeVariants, answerBank, resumeDraft, customQuestions, setResumeDraft, storageReady, storageError, snapshot, ai]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore 必须在 StoreProvider 内使用");
  return value;
}

/** 五组练习题。题目里带上公司和岗位，方便直接照着答。 */
export function buildInterviewGroups(company: string, title: string) {
  const target = company || "目标公司";
  const role = title || "目标岗位";

  return {
    自我介绍: [
      { q: `用两分钟介绍你自己，重点说明为什么适合 ${target} 的${role}。`, a: "" },
      { q: "你的三段经历里，哪一段最能支撑这个岗位？", a: "" },
    ],
    行为面: [
      { q: "讲一次你在时间紧张的情况下完成任务的经历。", a: "" },
      { q: "讲一次你和队友意见不一致最后怎么解决的。", a: "" },
      { q: "讲一次你主动发现并修正问题的经历。", a: "" },
    ],
    专业面: [
      { q: `这个岗位日常要用到的核心技能是什么，你目前到什么程度？`, a: "" },
      { q: "举一个你独立完成的分析或项目，说清你的方法和结论。", a: "" },
    ],
    针对JD: [
      { q: `JD 里的哪一条要求你最有把握？请给证据。`, a: "" },
      { q: "JD 里的哪一条你还欠缺？你打算怎么补？", a: "" },
    ],
    反问环节: [
      { q: "你想问团队什么？准备两个有质量的问题。", a: "" },
      { q: "你希望入职后前三个月做成什么？", a: "" },
    ],
  };
}
