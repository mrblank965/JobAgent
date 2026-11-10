"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { KeywordList } from "@/components/analysis/KeywordList";
import { MatchScore } from "@/components/analysis/MatchScore";
import { SuggestionList } from "@/components/analysis/SuggestionList";
import { DIRECTIONS, buildResumeCandidate } from "@/lib/career";
import { analyzeJD } from "@/lib/jd";
import { useStore, type JDEntry } from "@/lib/store";

/** 覆盖率到三档色调，阈值跟 JD 拆解器保持同一套语言。 */
function toneOf(coverage: number) {
  return coverage >= 0.7 ? "hit" : coverage >= 0.4 ? "partial" : "miss";
}

export default function MatchPage() {
  const { profile, jds, apps, addApp, resumeVariants, resumeDraft, storageReady } = useStore();
  /** 和方向分析用同一份候选：已保存版本 + 当前草稿。 */
  const { skills, rawResume, hasUnsavedDraft, isEmpty } = buildResumeCandidate({
    profile,
    resumeVariants,
    resumeDraft,
  });
  // 用 Set 支持同时展开多份 JD，跨 JD 对比缺口时不用来回点
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState("");

  // 操作提示挂几秒就自己消掉，免得下一次操作前一直占着页面顶部
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  /**
   * 每份 JD 都重算一次，不读 jd.keywords。
   * 那个字段是加 JD 当时的快照，画像改过之后就对不上了。
   *
   * 排序用覆盖率，和 analyzeJD 的 score 是同一个口径（命中占比，沾边算四成）。
   * 分数打平的 JD 再用命中条数、score 依次比较。
   */
  /** 标了方向、但该方向还没有简历版本的 JD，按方向汇总。 */
  const missingDirections = useMemo(() => {
    const counter = new Map<string, { name: string; count: number }>();
    for (const jd of jds) {
      const id = jd.directionId ?? "";
      if (!id) continue;
      if (resumeVariants.some((item) => item.directionId === id)) continue;
      const name = DIRECTIONS.find((item) => item.id === id)?.name ?? id;
      const current = counter.get(id) ?? { name, count: 0 };
      counter.set(id, { name, count: current.count + 1 });
    }
    return [...counter.values()];
  }, [jds, resumeVariants]);

  /**
   * 每份 JD 用它自己方向对应的简历版本来算分。
   * 没标方向、或该方向还没有简历版本时，退回全局候选（所有版本 + 草稿）。
   */
  const candidateByDirection = useMemo(() => {
    const cache = new Map<string, { skills: string[]; rawResume: string }>();
    for (const jd of jds) {
      const key = jd.directionId ?? "";
      if (cache.has(key)) continue;
      const scoped = buildResumeCandidate({
        profile,
        resumeVariants,
        resumeDraft,
        directionId: key || undefined,
      });
      cache.set(key, { skills: scoped.skills, rawResume: scoped.rawResume });
    }
    return cache;
  }, [jds, profile, resumeVariants, resumeDraft]);

  const ranked = useMemo(() => {
    const rows = jds.map((jd) => {
      const scoped = candidateByDirection.get(jd.directionId ?? "") ?? { skills, rawResume };
      const analysis = analyzeJD(jd.raw, scoped.skills, scoped.rawResume);
      const { hits, partial, missing, score } = analysis.match;
      const keywordCount = analysis.keywords.length;

      return {
        jd,
        analysis,
        score,
        hitCount: hits.length,
        partialCount: partial.length,
        missingCount: missing.length,
        keywordCount,
        coverage: keywordCount ? hits.length / keywordCount : 0,
      };
    });

    rows.sort(
      (left, right) =>
        right.coverage - left.coverage ||
        right.hitCount - left.hitCount ||
        right.score - left.score ||
        (left.jd.title || "").localeCompare(right.jd.title || ""),
    );

    return rows;
  }, [jds, skills, rawResume, candidateByDirection]);

  /** 跨 JD 高频缺口。单看一份 JD 得不出这个结论，只有放在一起数才知道先补哪个。 */
  const gapStats = useMemo(() => {
    const tally = new Map<string, { count: number; companies: string[] }>();

    for (const row of ranked) {
      for (const word of row.analysis.match.missing) {
        const entry = tally.get(word) ?? { count: 0, companies: [] };
        entry.count += 1;
        // 同一家公司投多份 JD 缺同一个词时只记一次，chip 的悬停提示才不会重复
        const company = row.jd.company || "未知公司";
        if (!entry.companies.includes(company)) entry.companies.push(company);
        tally.set(word, entry);
      }
    }

    return [...tally.entries()]
      .map(([word, value]) => ({ word, count: value.count, companies: value.companies }))
      .sort((left, right) => right.count - left.count || left.word.localeCompare(right.word))
      .slice(0, 8);
  }, [ranked]);

  /** 只把被两份以上 JD 同时要求的缺口转成建议，只出现一次的没有优先补的价值。 */
  const gapSuggestions = gapStats
    .filter((item) => item.count >= 2)
    .slice(0, 5)
    .map(
      (item) =>
        `「${item.word}」被 ${item.count} 份 JD 要求，画像里还没有。如果确有相关经历，优先补进简历。`,
    );

  function addToBoard(jd: JDEntry) {
    const name = `${jd.company || "未知公司"} · ${jd.title || "未命名岗位"}`;

    if (apps.some((item) => item.jdId === jd.id)) {
      setNotice(`「${name}」已经在投递看板里了。`);
      return;
    }

    addApp({ company: jd.company, title: jd.title, status: "待投递", note: "", jdId: jd.id });
    setNotice(`已把「${name}」加入投递看板。`);
  }

  // 数据从 IndexedDB 异步读回来，没读完就先别判断空态，免得闪一下又变
  if (!storageReady) {
    return (
      <>
        <div className="view-head">
          <h1>⚖️ 岗位匹配</h1>
        </div>
        <div className="warnbox">正在读取本地资料…</div>
      </>
    );
  }

  if (isEmpty) {
    return (
      <>
        <div className="view-head">
          <h1>⚖️ 岗位匹配</h1>
        </div>
        <div className="empty">
          <span className="big">🪶</span>
          还没有可用的简历信息，算不出覆盖率。先到「简历解析」上传或粘贴简历。
          <div className="mt12">
            <Link className="btn primary" href="/resume">
              去简历解析
            </Link>
          </div>
        </div>
      </>
    );
  }

  if (jds.length === 0) {
    return (
      <>
        <div className="view-head">
          <h1>⚖️ 岗位匹配</h1>
          <p>把存过的 JD 放到一张榜上排序，回答先投哪个、差在哪。</p>
        </div>
        <div className="empty">
          <span className="big">📭</span>
          还没有 JD，没有可对比的对象。先到「JD 拆解器」粘贴几份岗位原文。
          <div className="mt12">
            <Link className="btn primary" href="/jd">
              去 JD 拆解器
            </Link>
          </div>
        </div>
      </>
    );
  }

  const top = ranked[0];
  const hasResumeText = rawResume.trim().length > 0;

  return (
    <>
      <div className="view-head">
        <h1>⚖️ 岗位匹配</h1>
        <p>把存过的 JD 放到一张榜上排序，回答先投哪个、差在哪。</p>
      </div>

      {notice ? <div className="warnbox mb12">{notice}</div> : null}

      {hasUnsavedDraft ? (
        <div className="warnbox mb12">当前使用的是未保存的解析结果，保存到资料库后才会写进简历版本。</div>
      ) : null}

      <MatchScore
        score={Math.round(top.coverage * 100)}
        label="关键词覆盖率"
        caption={`覆盖最高：${top.jd.company || "未知公司"} · ${top.jd.title || "未命名岗位"}`}
        tone={toneOf(top.coverage)}
      />

      <div className="split mt16">
        <div className="card">
          <div className="spread">
            <h3>当前简历画像</h3>
            <Link className="btn sm" href="/resume">
              去更新
            </Link>
          </div>

          <div className="copyrow">
            <span className="k">技能标签</span>
            <span className="v">{skills.length} 项</span>
          </div>
          <div className="copyrow">
            <span className="k">简历原文</span>
            <span className="v">{rawResume.trim().length} 字</span>
          </div>
          <div className="tiny mt8">
            每份 JD 用它<b>所属方向</b>的简历版本算分；JD 没标方向时用上面这份合并画像。
          </div>
          {missingDirections.length > 0 ? (
            <div className="tiny mt8 warn-text">
              这些方向还没有简历版本，相关 JD 已按默认版本算分：
              {missingDirections.map((item) => `${item.name}（${item.count} 份）`).join("、")}
            </div>
          ) : null}

          {hasResumeText ? null : (
            <div className="tiny mt8 warn-text">
              还没有简历原文，命中项只能显示「技能库已含」，看不到具体出处。补上原文更准。
            </div>
          )}
        </div>

        <div className="card">
          <div className="spread">
            <h3>跨岗位高频缺口</h3>
            <span className="tiny">{gapStats.length} 个</span>
          </div>

          {gapStats.length > 0 ? (
            <>
              <div className="mt8">
                {gapStats.map((item) => (
                  <span
                    key={item.word}
                    className="chip miss"
                    title={`要求方：${item.companies.join("、")}`}
                  >
                    {item.word} × {item.count}
                  </span>
                ))}
              </div>
              <div className="tiny mt8">
                后面的数字是要求这个词的 JD 份数。出现得越多，补它的收益越大。
              </div>
            </>
          ) : (
            <div className="tiny mt8">所有 JD 的要求都覆盖到了，没有共同缺口。</div>
          )}
        </div>
      </div>

      <div className="spread mt16">
        <h3>按覆盖率排序</h3>
        <span className="tiny">共 {ranked.length} 份</span>
      </div>

      <div className="cards mt8" style={{ gridTemplateColumns: "1fr" }}>
        {ranked.map((row, index) => {
          const open = openIds.has(row.jd.id);

          return (
            <div className="card" key={row.jd.id}>
              <div className="spread">
                <div>
                  <b>
                    {index + 1}. {row.jd.company || "未知公司"} · {row.jd.title || "未命名岗位"}
                  </b>
                  <div className="tiny">
                    {row.analysis.keywords.slice(0, 6).join(" · ") || "未提取到关键词"}
                  </div>
                </div>

                <div className="row">
                  <span className={`tag ${toneOf(row.coverage)}`}>
                    覆盖 {Math.round(row.coverage * 100)}%
                  </span>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() =>
                      setOpenIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.jd.id)) next.delete(row.jd.id);
                        else next.add(row.jd.id);
                        return next;
                      })
                    }
                  >
                    {open ? "收起" : "展开详情"}
                  </button>
                  <button type="button" className="btn clay sm" onClick={() => addToBoard(row.jd)}>
                    📮 加入投递
                  </button>
                  <Link className="btn primary sm" href={`/optimize?jd=${encodeURIComponent(row.jd.id)}`}>
                    📝 去定制简历
                  </Link>
                </div>
              </div>

              <div className="scorebar mt8">
                <i style={{ width: `${row.coverage * 100}%` }} />
              </div>
              <div className="tiny mt8">
                命中 {row.hitCount} · 部分 {row.partialCount} · 缺口 {row.missingCount} · 该 JD 共{" "}
                {row.keywordCount} 个关键词
              </div>

              {open ? (
                <div className="mt12">
                  <div className="cards" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                    <KeywordList
                      title="命中"
                      items={row.analysis.match.hits.map((item) => item.k)}
                    />
                    <KeywordList
                      title="部分匹配"
                      items={row.analysis.match.partial.map((item) => item.k)}
                      tone="warning"
                    />
                    <KeywordList title="缺口" items={row.analysis.match.missing} tone="danger" />
                  </div>

                  {row.analysis.match.hits.length > 0 ? (
                    <>
                      <label className="fl">命中项的简历出处</label>
                      <table className="t">
                        <thead>
                          <tr>
                            <th>关键词</th>
                            <th style={{ width: 70 }}>状态</th>
                            <th>简历证据</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.analysis.match.hits.map((item) => (
                            <tr key={item.k}>
                              <td>{item.k}</td>
                              <td>
                                <span className="tag hit">命中</span>
                              </td>
                              <td className="tiny">{item.ev}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  ) : null}

                  <label className="fl">该 JD 的职责</label>
                  {row.analysis.duties.length > 0 ? (
                    <ul className="muted" style={{ paddingLeft: 18, fontSize: 13 }}>
                      {row.analysis.duties.slice(0, 5).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <div className="tiny">没拆出职责段落，可以回 JD 拆解器看原文。</div>
                  )}

                  <div className="tiny mt8">
                    本地匹配度 {row.score}，按命中占比算，沾边的关键词算四成，和上面的覆盖率同一口径。
                    这张榜的排序用的是覆盖率。
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {gapSuggestions.length > 0 ? (
        <div className="mt16">
          <SuggestionList suggestions={gapSuggestions} />
        </div>
      ) : null}

      <div className="tiny mt16">
        排序依据是关键词覆盖率，等于命中数除以该 JD 提取到的关键词数，跨 JD 可比。
        本地匹配度在此基础上给沾边的关键词算四成，所以可能比覆盖率略高。
        两者都按本地规则算，不联网。
      </div>
    </>
  );
}
