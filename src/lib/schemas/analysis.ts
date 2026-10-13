import type { JDData, MatchResult, ResumeData } from "@/types/analysis";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === "string";

/** 项目类条目允许的类型。 */
const EXPERIENCE_CATEGORIES = ["paper", "competition", "project"];

const isExperienceEntry = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const entry = value as {
    title?: unknown;
    role?: unknown;
    periodStart?: unknown;
    periodEnd?: unknown;
    bullets?: unknown;
    category?: unknown;
  };
  const categoryOk =
    entry.category === undefined ||
    (typeof entry.category === "string" && EXPERIENCE_CATEGORIES.includes(entry.category));
  return (
    typeof entry.title === "string" &&
    typeof entry.role === "string" &&
    typeof entry.periodStart === "string" &&
    typeof entry.periodEnd === "string" &&
    isStringArray(entry.bullets) &&
    categoryOk
  );
};

const isExperienceArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every((entry) => isExperienceEntry(entry));

/** 学历层次允许的取值。 */
const EDUCATION_DEGREES = ["doctor", "master", "bachelor", "associate", "other"];

const isEducationEntry = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.degree === "string" &&
    EDUCATION_DEGREES.includes(entry.degree) &&
    typeof entry.school === "string" &&
    typeof entry.college === "string" &&
    typeof entry.major === "string" &&
    typeof entry.periodStart === "string" &&
    typeof entry.periodEnd === "string" &&
    typeof entry.performance === "string"
  );
};

const isEducationArray = (value: unknown): boolean =>
  Array.isArray(value) && value.every((entry) => isEducationEntry(entry));

export function isResumeData(value: unknown): value is ResumeData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ResumeData>;
  return (
    isOptionalString(data.name) &&
    isOptionalString(data.email) &&
    isOptionalString(data.phone) &&
    isEducationArray(data.education) &&
    isStringArray(data.honors) &&
    isExperienceArray(data.experiences) &&
    isExperienceArray(data.projects) &&
    isStringArray(data.skills) &&
    isStringArray(data.strengths)
  );
}

export function isJDData(value: unknown): value is JDData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<JDData>;
  return typeof data.jobTitle === "string" && isStringArray(data.requiredSkills) && isStringArray(data.preferredSkills);
}

export function isMatchResult(value: unknown): value is MatchResult {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<MatchResult>;
  return isStringArray(data.matched) && isStringArray(data.partial) && isStringArray(data.missing) && isStringArray(data.suggestions);
}
