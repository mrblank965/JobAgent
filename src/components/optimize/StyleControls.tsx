"use client";

import { useMemo } from "react";
import {
  EXPRESSION_STRENGTHS,
  LANGUAGE_STYLES,
  LENGTH_OPTIONS,
  getStyle,
  recommendStyle,
  type ExpressionStrength,
  type StyleSettings,
} from "@/lib/languageStyles";

type StyleControlsProps = {
  /** 当前选中的 JD 原文，用来猜推荐风格；没有就跳过推荐。 */
  jdText: string;
  value: StyleControlsValue;
  onChange: (next: StyleControlsValue) => void;
};

/** 和 StyleSettings 一致，单独起名只是为了这个组件的 props 更好读。 */
export type StyleControlsValue = StyleSettings;

/**
 * 语言风格选择。
 *
 * 放在「AI 逐段改写」之前——风格定了，模型才知道该怎么写。
 *
 * 主风格必选，决定信息顺序、句式和默认长度；辅风格可选，只补充最多两个强调点，
 * 不能和主风格相同。下面三个是通用设置，会覆盖风格自带的默认值。
 */
export function StyleControls({ jdText, value, onChange }: StyleControlsProps) {
  const recommendation = useMemo(() => recommendStyle(jdText), [jdText]);

  const primary = LANGUAGE_STYLES.find((item) => item.id === value.primaryId) ?? null;

  function patch(next: Partial<StyleControlsValue>) {
    onChange({ ...value, ...next });
  }

  return (
    <div className="card mt12">
      <div className="spread">
        <h3>🎚️ 语言风格</h3>
        <span className="tiny">先定风格，再让 AI 改写</span>
      </div>

      <p className="tiny">
        主风格决定这条经历「怎么读」——信息先说什么后说什么、用哪类动词、默认多长。
        <b>风格不决定写什么</b>，内容永远来自你的简历原文。
      </p>

      {recommendation.id ? (
        <div className="warnbox mt8">
          这份 JD 看起来偏「<b>{getStyle(recommendation.id).name}</b>」，命中信号词：
          {recommendation.matched.slice(0, 6).join("、")}
          <div className="row mt8">
            <button
              type="button"
              className="btn sm"
              onClick={() => patch({ primaryId: recommendation.id ?? "" })}
            >
              用这个作主风格
            </button>
          </div>
        </div>
      ) : jdText.trim() ? (
        <div className="tiny mt8">这份 JD 里没读到明显的风格信号，自己选一个就行。</div>
      ) : (
        <div className="tiny mt8">在上方选好 JD，这里会给出风格推荐。</div>
      )}

      <div className="split mt12">
        <div>
          <label className="fl">主风格（必选）</label>
          <select className="input" value={value.primaryId} onChange={(event) => patch({ primaryId: event.target.value })}>
            <option value="">— 请选择 —</option>
            {LANGUAGE_STYLES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {primary ? <div className="tiny mt4">{primary.positioning}</div> : null}
        </div>

        <div>
          <label className="fl">辅风格（可选，不能和主风格相同）</label>
          <select
            className="input"
            value={value.secondaryId}
            onChange={(event) => patch({ secondaryId: event.target.value })}
          >
            <option value="">— 不启用 —</option>
            {LANGUAGE_STYLES.filter((item) => item.id !== value.primaryId).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {value.secondaryId ? (
            <div className="tiny mt4">只补充最多两个强调点，不改变主风格的结构。</div>
          ) : (
            <div className="tiny mt4">留空就用主风格一种，结构最干净。</div>
          )}
        </div>
      </div>

      {primary ? (
        <div className="mt12" style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <p className="tiny" style={{ marginTop: 0 }}>{primary.description}</p>

          <div className="split mt8">
            <div>
              <label className="fl" style={{ marginTop: 0 }}>
                这段经历按它写出来该有的骨架
              </label>
              <ol className="muted" style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>
                {primary.structure.map((item) => (
                  <li key={item} style={{ marginBottom: 4 }}>
                    {item}
                  </li>
                ))}
              </ol>

              <label className="fl">信息摆放顺序</label>
              <div className="tiny">{primary.informationOrder.join(" → ")}</div>

              <label className="fl">要强调的点</label>
              <ul className="muted" style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>
                {primary.emphasis.map((item) => (
                  <li key={item} style={{ marginBottom: 4 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label className="fl" style={{ marginTop: 0 }}>
                句式参考
              </label>
              <ul className="muted" style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>
                {primary.sentencePatterns.map((item) => (
                  <li key={item} style={{ marginBottom: 4 }}>
                    {item}
                  </li>
                ))}
              </ul>

              <label className="fl">你的原文里有这些事实时，优先挑出来用</label>
              <ul className="muted" style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>
                {primary.factPriority.map((item) => (
                  <li key={item} style={{ marginBottom: 4 }}>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="tiny mt4">
                <b>原文里没有的，照这张表也不许写。</b>它只用来挑，不用来补。
              </div>

              <label className="fl">偏好的动词</label>
              <div>
                {primary.verbs.map((word) => (
                  <span key={word} className="chip">
                    {word}
                  </span>
                ))}
              </div>

              <label className="fl">尽量避开</label>
              <div>
                {primary.avoid.map((word) => (
                  <span key={word} className="chip miss">
                    {word}
                  </span>
                ))}
              </div>
              <div className="tiny mt4">{primary.avoidNote}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="split mt12">
        <div>
          <label className="fl">表达力度</label>
          <select
            className="input"
            value={value.strength}
            onChange={(event) => patch({ strength: event.target.value as ExpressionStrength })}
          >
            {EXPRESSION_STRENGTHS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="tiny mt4">
            {EXPRESSION_STRENGTHS.find((item) => item.id === value.strength)?.hint}
          </div>
        </div>

        <div>
          <label className="fl">单条要点长度</label>
          <select
            className="input"
            value={value.maxLength}
            onChange={(event) => patch({ maxLength: Number(event.target.value) })}
          >
            {LENGTH_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="tiny mt4">超了会压措辞，不会靠删事实来凑。</div>
        </div>
      </div>

      <label className="mt12" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={value.preferNumbers}
          onChange={(event) => patch({ preferNumbers: event.target.checked })}
        />
        <span className="tiny">
          优先量化：原文已有的数量、比例、金额、效率尽量写进要点。<b>原文没有的数字仍然不许编。</b>
        </span>
      </label>
    </div>
  );
}
