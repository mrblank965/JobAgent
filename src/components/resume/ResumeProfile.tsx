"use client";

import { DIRECTIONS } from "@/lib/career";
import { DEGREE_LABELS } from "@/lib/parsers/resumeText";
import { ANIMAL_OPTIONS, CITY_OPTIONS, JOB_TYPES, useStore } from "@/lib/store";
import type { ResumeData } from "@/types/analysis";
import { EducationEditor } from "./EducationEditor";

type ResumeProfileProps = {
  value: ResumeData;
  onChange: (next: ResumeData) => void;
};

/**
 * 结构化画像，对应参考页右栏那张卡片。
 *
 * 只放概括性字段和学历明细，技能、优势、荣誉都在下面的明细卡片里，
 * 这样左右两栏高度接近，不会一边特别长。
 */
export function ResumeProfile({ value, onChange }: ResumeProfileProps) {
  const { profile, setProfile } = useStore();
  const name = value.name ?? "";

  /**
   * 明细里的四项只反映**这一次解析**的第一条教育经历，
   * 不从全局画像兜底，免得旧资料的新值混在一起看不出哪个是真的。
   */
  const firstEducation = value.education[0] ?? null;
  const parsedGradYear = firstEducation?.periodEnd ? firstEducation.periodEnd.slice(0, 4) : "";
  const parsedSchool = firstEducation?.school ?? "";
  const parsedMajor = firstEducation?.major ?? "";
  const parsedDegree = firstEducation ? DEGREE_LABELS[firstEducation.degree] : "";

  return (
    <div className="card">
      <div className="spread">
        <h3>
          {profile.avatar ? <span className="avatar-badge">{profile.avatar}</span> : null}
          结构化画像
        </h3>
        <span className="tiny">自动保存到本机浏览器</span>
      </div>

      <div className="avatar-row mt8">
        <span className="tiny">头像</span>
        {ANIMAL_OPTIONS.map((animal) => (
          <button
            key={animal}
            type="button"
            className={`avatar-btn${profile.avatar === animal ? " active" : ""}`}
            onClick={() =>
              setProfile((current) => ({ ...current, avatar: current.avatar === animal ? "" : animal }))
            }
            aria-label={`选择头像 ${animal}`}
            aria-pressed={profile.avatar === animal}
          >
            {animal}
          </button>
        ))}
      </div>

      <div className="split">
        <div>
          <label className="fl">姓名</label>
          <input
            className="input"
            style={{ fontFamily: "var(--serif)", fontSize: 16 }}
            value={name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            placeholder="未识别到姓名，可以补充"
          />
        </div>
        <div>
          <label className="fl">邮箱</label>
          <input
            className="input"
            type="email"
            value={value.email ?? ""}
            onChange={(event) => onChange({ ...value, email: event.target.value })}
            placeholder="未识别到邮箱，可以补充"
          />
        </div>
        <div>
          <label className="fl">手机号</label>
          <input
            className="input"
            type="tel"
            value={value.phone ?? ""}
            onChange={(event) => onChange({ ...value, phone: event.target.value })}
            placeholder="未识别到手机号，可以补充"
          />
        </div>
        <div>
          <label className="fl">毕业年份</label>
          <input className="input" readOnly value={parsedGradYear} placeholder="—" />
        </div>
        <div>
          <label className="fl">学校</label>
          <input className="input" readOnly value={parsedSchool} placeholder="—" />
        </div>
        <div>
          <label className="fl">专业</label>
          <input className="input" readOnly value={parsedMajor} placeholder="—" />
        </div>
        <div>
          <label className="fl">学历</label>
          <input className="input" readOnly value={parsedDegree} placeholder="—" />
        </div>
        <div>
          <label className="fl">求职类型</label>
          <select
            className="input"
            value={profile.jobType}
            onChange={(event) => setProfile((current) => ({ ...current, jobType: event.target.value }))}
          >
            {JOB_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tiny mt8">
        {firstEducation
          ? "毕业年份、学校、专业、学历这四项来自本次解析，点「保存到资料库」后同步到资料库；要修改请直接改下面的教育明细。"
          : "本次未解析到教育经历。上面的毕业年份、学校、专业、学历留空，可以直接在下面的教育明细里补充。"}
      </div>

      <label className="fl">目标方向</label>
      <select
        className="input"
        value={profile.target}
        onChange={(event) => setProfile((current) => ({ ...current, target: event.target.value }))}
      >
        <option value="">— 请选择 —</option>
        {DIRECTIONS.map((direction) => (
          <option key={direction.id} value={direction.name}>
            {direction.name}
          </option>
        ))}
      </select>

      <label className="fl">
        意向城市
        <span className="tiny" style={{ marginLeft: 6 }}>
          可多选，点一下选中，再点取消
        </span>
      </label>
      <div>
        {CITY_OPTIONS.map((city) => {
          const active = profile.cities.includes(city);

          return (
            <button
              key={city}
              type="button"
              className={`itab${active ? " active" : ""}`}
              style={{ marginRight: 6, marginBottom: 6 }}
              onClick={() =>
                setProfile((current) => ({
                  ...current,
                  cities: current.cities.includes(city)
                    ? current.cities.filter((item) => item !== city)
                    : [...current.cities, city],
                }))
              }
              aria-pressed={active}
            >
              {city}
            </button>
          );
        })}
      </div>

      {name.length === 0 ? (
        <div className="tiny mt8 warn-text">原文前几行没有找到可靠的人名，按规则留空，请手动填写。</div>
      ) : null}

      <div className="mt12">
        <EducationEditor
          items={value.education}
          onChange={(education) => onChange({ ...value, education })}
        />
      </div>
    </div>
  );
}
