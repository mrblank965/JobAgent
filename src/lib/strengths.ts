import type { ResumeData } from "@/types/analysis";

/**
 * 候选优势。
 *
 * 这里只做归纳，不加简历里没有的信息。每条候选都带一条依据，
 * 说明它是从哪部分内容算出来的，用户能自己判断这句话站不站得住。
 *
 * 候选不等于结果。它们只会显示在界面上，用户点加号才会进入优势列表。
 */
export type StrengthCandidate = {
  text: string;
  reason: string;
};

/** 从已解析的简历数据里提炼候选优势。 */
export function suggestStrengths(resume: ResumeData): StrengthCandidate[] {
  const candidates: StrengthCandidate[] = [];

  const skills = resume.skills.filter((skill) => skill.length > 0);
  if (skills.length >= 2) {
    candidates.push({
      text: `熟悉 ${skills.slice(0, 4).join("、")}`,
      reason: `技能栏共 ${skills.length} 项`,
    });
  }

  const papers = resume.projects.filter((item) => item.category === "paper");
  if (papers.length > 0) {
    candidates.push({
      text: `有 ${papers.length} 项论文或科研成果`,
      reason: "项目经历里标记为论文的条目",
    });
  }

  const competitions = resume.projects.filter((item) => item.category === "competition");
  if (competitions.length > 0) {
    const highLevel = competitions.some((item) => /国家级|国际|全国/.test(item.title));
    candidates.push({
      text: highLevel
        ? `获得国家级或国际竞赛奖项 ${competitions.length} 项`
        : `获得竞赛奖项 ${competitions.length} 项`,
      reason: "项目经历里标记为竞赛的条目，级别取自标题原文",
    });
  }

  const projects = resume.projects.filter((item) => (item.category ?? "project") === "project");
  if (projects.length > 0) {
    candidates.push({
      text: `参与 ${projects.length} 个项目`,
      reason: "项目经历里标记为项目的条目",
    });
  }

  if (resume.experiences.length >= 2) {
    candidates.push({
      text: `累计 ${resume.experiences.length} 段实习或工作经历`,
      reason: "实习与工作经历栏的条目数",
    });
  }

  return candidates;
}
