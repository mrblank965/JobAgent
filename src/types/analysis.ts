/**
 * 项目类条目的类型。
 * 论文和竞赛都写在项目经历段落里，但性质不同，用这个字段区分。
 * 只有 projects 会用到，experiences 不带这个字段。
 */
export type ExperienceCategory = "paper" | "competition" | "project";

export type ExperienceEntry = {
  category?: ExperienceCategory;
  /** 机构、公司、赛事或论文的名称。 */
  title: string;
  /** 岗位、角色或奖项，例如 战略部实习生、第一作者、国家级二等奖。 */
  role: string;
  /** 起始时间，格式 YYYY-MM，识别不到就留空。 */
  periodStart: string;
  /** 结束时间，格式 YYYY-MM，只有一个时间点时留空。 */
  periodEnd: string;
  bullets: string[];
};

/** 学历层次。 */
export type EducationDegree = "doctor" | "master" | "bachelor" | "associate" | "other";

export type EducationEntry = {
  degree: EducationDegree;
  /** 学校，例如 中山大学。 */
  school: string;
  /** 学院，例如 岭南学院。 */
  college: string;
  /** 专业，例如 金融专硕。 */
  major: string;
  /** 起始时间，格式 YYYY-MM-DD。 */
  periodStart: string;
  /** 结束时间，格式 YYYY-MM-DD。 */
  periodEnd: string;
  /** 学业表现，例如 GPA 3.8/4.0、专业排名前 10%。 */
  performance: string;
};

export type ResumeData = {
  name?: string;
  education: EducationEntry[];
  /** 奖学金、荣誉称号这类，不属于学历，单独放。 */
  honors: string[];
  /** 实习经历和工作经历。 */
  experiences: ExperienceEntry[];
  /** 项目经历、科研和论文，与实习经历分开存放。 */
  projects: ExperienceEntry[];
  skills: string[];
  strengths: string[];
};

export type JDData = {
  jobTitle: string;
  requiredSkills: string[];
  preferredSkills: string[];
  education?: string;
  experience?: string;
};

export type MatchResult = {
  matched: string[];
  partial: string[];
  missing: string[];
  suggestions: string[];
};
