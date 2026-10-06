export type ResumeData = {
  name?: string;
  education: string[];
  skills: string[];
  experiences: string[];
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
