"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

/**
 * 页面内存里的共享状态。
 *
 * 只用 React state，不写 localStorage、不写数据库，刷新浏览器即清空。
 * 放在根布局的 Provider 里，所以同一个会话内跨页面切换不会丢。
 */

export type Profile = {
  name: string;
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
};

export type Application = {
  id: string;
  company: string;
  title: string;
  /** 六列看板的状态，取值见 STATUSES。 */
  status: string;
  note: string;
};

export type InterviewRecord = {
  id: string;
  company: string;
  title: string;
  /** 分组名到问答列表。 */
  groups: Record<string, { q: string; a: string }[]>;
};

export const STATUSES = ["待投递", "已投递", "笔试", "面试", "Offer", "结束"];

type StoreValue = {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  jds: JDEntry[];
  addJD: (entry: Omit<JDEntry, "id">) => string;
  apps: Application[];
  addApp: (entry: Omit<Application, "id">) => void;
  moveApp: (id: string, status: string) => void;
  updateAppNote: (id: string, note: string) => void;
  removeApp: (id: string) => void;
  interviews: InterviewRecord[];
  ensureInterview: (app: Application) => void;
  setInterviewAnswer: (id: string, group: string, index: number, answer: string) => void;
  ai: AISettings;
  setAI: (next: AISettings) => void;
};

const emptyProfile: Profile = {
  name: "",
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

const StoreContext = createContext<StoreValue | null>(null);

/** 简单的自增 id，只在页面内存里有效，不需要全局唯一。 */
let seq = 0;
const uid = (prefix: string) => `${prefix}_${(seq += 1)}_${Date.now().toString(36)}`;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [jds, setJds] = useState<JDEntry[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [interviews, setInterviews] = useState<InterviewRecord[]>([]);
  const [ai, setAI] = useState<AISettings>(emptyAI);

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

      apps,
      addApp(entry) {
        setApps((current) => [...current, { ...entry, id: uid("app") }]);
      },
      moveApp(id, status) {
        setApps((current) => current.map((item) => (item.id === id ? { ...item, status } : item)));
      },
      updateAppNote(id, note) {
        setApps((current) => current.map((item) => (item.id === id ? { ...item, note } : item)));
      },
      removeApp(id) {
        setApps((current) => current.filter((item) => item.id !== id));
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
      ai,
      setAI,
    };
  }, [profile, jds, apps, interviews, ai]);

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
