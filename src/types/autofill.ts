import type { EducationEntry, ExperienceEntry } from "@/types/analysis";

export type AutofillPackageProfile = {
  name: string;
  email: string;
  phone: string;
  /** 下面三项国内网申常填，资料库没填就是空串。 */
  gender: string;
  birth: string;
  political: string;
  location: string;
  school: string;
  major: string;
  degree: string;
  graduationYear: string;
  jobType: string;
  cities: string[];
  /** 只有用户在资料库中明确核对后才会出现。 */
  workAuthorization?: string;
};

export type AutofillConfirmedAnswer = {
  question: string;
  answer: string;
};

/** JobAgent 与浏览器简历助手之间的第一版文件交换协议。 */
export type AutofillPackageV1 = {
  schema: "jobagent-autofill-package";
  version: 1;
  packageId: string;
  createdAt: string;
  resumeVariant: {
    id: string;
    name: string;
    directionId: string;
    directionName: string;
  };
  profile: AutofillPackageProfile;
  education: EducationEntry[];
  experiences: ExperienceEntry[];
  projects: ExperienceEntry[];
  honors: string[];
  skills: string[];
  strengths: string[];
  confirmedAnswers: AutofillConfirmedAnswer[];
};
