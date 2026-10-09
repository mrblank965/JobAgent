"use client";

import { DIRECTIONS } from "@/lib/career";
import { ANIMAL_OPTIONS, CITY_OPTIONS, DEGREE_OPTIONS, JOB_TYPES, useStore } from "@/lib/store";
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

  return (
    <div className="card">
      <div className="spread">
        <h3>
          {profile.avatar ? <span className="avatar-badge">{profile.avatar}</span> : null}
          结构化画像
        </h3>
        <span className="tiny">数据只在页面内存里，刷新即清空</span>
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
          <label className="fl">毕业年份</label>
          <input
            className="input"
            value={profile.gradYear}
            onChange={(event) => setProfile((current) => ({ ...current, gradYear: event.target.value }))}
            placeholder="例如 2026"
          />
        </div>
        <div>
          <label className="fl">学校</label>
          <input
            className="input"
            value={profile.school}
            onChange={(event) => setProfile((current) => ({ ...current, school: event.target.value }))}
            placeholder="例如 中山大学"
          />
        </div>
        <div>
          <label className="fl">专业</label>
          <input
            className="input"
            value={profile.major}
            onChange={(event) => setProfile((current) => ({ ...current, major: event.target.value }))}
            placeholder="例如 金融专硕"
          />
        </div>
        <div>
          <label className="fl">学历</label>
          <select
            className="input"
            value={profile.degree}
            onChange={(event) => setProfile((current) => ({ ...current, degree: event.target.value }))}
          >
            {DEGREE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
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
