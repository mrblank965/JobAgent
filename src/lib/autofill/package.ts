import { DIRECTIONS } from "@/lib/career";
import { isResumeData } from "@/lib/schemas/analysis";
import type { Profile } from "@/lib/store";
import type { AnswerBankEntry, ResumeVariant } from "@/types/application";
import type { AutofillPackageV1 } from "@/types/autofill";

type BuildAutofillPackageInput = {
  profile: Profile;
  resumeVariant: ResumeVariant;
  answerBank: AnswerBankEntry[];
  createdAt?: string;
  packageId?: string;
};

const makePackageId = (createdAt: string): string =>
  `pkg_${createdAt.replace(/\D/g, "").slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * 只整理扩展填写需要的数据。工作区备份、投递记录、面试记录、API Key 和简历原文都不会进入资料包。
 */
export function buildAutofillPackage({
  profile,
  resumeVariant,
  answerBank,
  createdAt = new Date().toISOString(),
  packageId,
}: BuildAutofillPackageInput): AutofillPackageV1 {
  const structured = resumeVariant.structuredData;
  const directionName = DIRECTIONS.find((item) => item.id === resumeVariant.directionId)?.name ?? "待分类";

  return {
    schema: "jobagent-autofill-package",
    version: 1,
    packageId: packageId ?? makePackageId(createdAt),
    createdAt,
    resumeVariant: {
      id: resumeVariant.id,
      name: resumeVariant.name,
      directionId: resumeVariant.directionId,
      directionName,
    },
    profile: {
      name: profile.name,
      email: profile.email,
      phone: profile.phone,
      location: profile.location,
      school: profile.school,
      major: profile.major,
      degree: profile.degree,
      graduationYear: profile.gradYear,
      jobType: profile.jobType,
      cities: [...profile.cities],
      ...(profile.workAuthorizationConfirmed && profile.workAuthorization.trim()
        ? { workAuthorization: profile.workAuthorization.trim() }
        : {}),
    },
    education: structured?.education.map((item) => ({ ...item })) ?? [],
    experiences: structured?.experiences.map((item) => ({ ...item, bullets: [...item.bullets] })) ?? [],
    projects: structured?.projects.map((item) => ({ ...item, bullets: [...item.bullets] })) ?? [],
    honors: [...(structured?.honors ?? [])],
    skills: [...(structured?.skills ?? profile.skills)],
    strengths: [...(structured?.strengths ?? profile.strengths)],
    confirmedAnswers: answerBank
      .filter((item) => item.confirmed && item.question.trim() && item.answer.trim())
      .map((item) => ({ question: item.question.trim(), answer: item.answer.trim() })),
  };
}

const isString = (value: unknown): value is string => typeof value === "string";
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);

/** 给扩展导入端复用的最低限度格式校验。 */
export function isAutofillPackageV1(value: unknown): value is AutofillPackageV1 {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AutofillPackageV1>;
  if (item.schema !== "jobagent-autofill-package" || item.version !== 1) return false;
  if (!isString(item.packageId) || !isString(item.createdAt)) return false;
  if (!item.resumeVariant || !item.profile) return false;

  const resumeData = {
    education: item.education,
    experiences: item.experiences,
    projects: item.projects,
    honors: item.honors,
    skills: item.skills,
    strengths: item.strengths,
  };

  return (
    isString(item.resumeVariant.id) &&
    isString(item.resumeVariant.name) &&
    isString(item.resumeVariant.directionId) &&
    isString(item.resumeVariant.directionName) &&
    isString(item.profile.name) &&
    isString(item.profile.email) &&
    isString(item.profile.phone) &&
    isString(item.profile.location) &&
    isString(item.profile.school) &&
    isString(item.profile.major) &&
    isString(item.profile.degree) &&
    isString(item.profile.graduationYear) &&
    isString(item.profile.jobType) &&
    isStringArray(item.profile.cities) &&
    (item.profile.workAuthorization === undefined || isString(item.profile.workAuthorization)) &&
    isResumeData(resumeData) &&
    Array.isArray(item.confirmedAnswers) &&
    item.confirmedAnswers.every(
      (answer) =>
        !!answer &&
        typeof answer === "object" &&
        isString(answer.question) &&
        isString(answer.answer),
    )
  );
}
