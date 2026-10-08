import type { JDData, MatchResult, ResumeData } from "@/types/analysis";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

export function isResumeData(value: unknown): value is ResumeData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ResumeData>;
  return isStringArray(data.education) && isStringArray(data.skills) && isStringArray(data.experiences);
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
