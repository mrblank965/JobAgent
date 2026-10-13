"use client";

import Link from "next/link";
import { useState } from "react";
import { analyzeJD, extractJDInfo } from "@/lib/jd";
import { useStore } from "@/lib/store";

export default function JDPage() {
  const { profile, jds, addJD, addApp } = useStore();

  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [raw, setRaw] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);

  /** 上传截图做文字识别。招聘贴常把 JD 做成图片，复制不到文字时用这个。 */
  async function handleOcr(files: FileList) {
    setOcrBusy(true);
    setNotice("正在识别图片，首次使用要先下载中文语言包，请稍候……");

    try {
      const formData = new FormData();
      for (const file of Array.from(files).slice(0, 10)) formData.append("images", file);

      const response = await fetch("/api/ocr", { method: "POST", body: formData });
      const payload = (await response.json()) as {
        text?: string;
        error?: string;
        pages?: { index: number; chars: number; confidence: number }[];
      };

      if (!response.ok || typeof payload.text !== "string") {
        setNotice(payload.error ?? "识别失败，请换清晰的截图重试。");
        return;
      }

      setRaw(payload.text);

      const weak = (payload.pages ?? []).filter((page) => page.confidence < 70);
      const base = `已识别 ${payload.pages?.length ?? 0} 张，共 ${payload.text.length} 个字，请核对后再拆解。`;
      setNotice(
        weak.length > 0
          ? `${base} 第 ${weak.map((page) => page.index).join("、")} 张置信度偏低，错字可能较多。`
          : base,
      );
    } catch {
      setNotice("无法连接服务器，请确认开发服务器仍在运行。");
    } finally {
      setOcrBusy(false);
    }
  }

  /** 读取网页正文。浏览器直接抓会被跨域拦，所以走服务端的 fetch-jd 路由。 */
  async function handleFetch() {
    if (url.trim().length === 0) {
      setNotice("请先填入网址。");
      return;
    }

    setFetching(true);
    setNotice("");

    try {
      const response = await fetch("/api/fetch-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const payload = (await response.json()) as { text?: string; error?: string; warning?: string };

      if (!response.ok || typeof payload.text !== "string") {
        setNotice(payload.error ?? "读取失败，请改用粘贴方式。");
        return;
      }

      setRaw(payload.text);
      setNotice(payload.warning ?? `已读入 ${payload.text.length} 个字，确认内容后再点拆解。`);
    } catch {
      setNotice("无法连接服务器，请确认开发服务器仍在运行。");
    } finally {
      setFetching(false);
    }
  }

  /** 复制到剪贴板，失败时退回手动选中。 */
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} 已复制。`);
    } catch {
      setNotice("浏览器不让自动复制，请手动选中复制。");
    }
  }

  function runParse() {
    const text = raw.trim();
    if (text.length < 20) {
      setNotice("JD 太短，至少粘贴 20 个字再拆解。");
      return;
    }

    const info = extractJDInfo(text);
    const id = addJD({
      company: company.trim() || info.company,
      title: title.trim() || info.title,
      raw: text,
      keywords: analyzeJD(text, profile.skills, "").keywords,
    });

    setOpenId(id);
    setCompany("");
    setTitle("");
    setRaw("");
    setNotice("");
  }

  const openJD = jds.find((item) => item.id === openId) ?? null;
  const analysis = openJD ? analyzeJD(openJD.raw, profile.skills, "") : null;

  if (openJD && analysis) {
    const { score, hits, partial, missing } = analysis.match;
    const tone = score >= 70 ? "hit" : score >= 40 ? "partial" : "miss";
    const verdict =
      score >= 70 ? "高度匹配，建议优先投" : score >= 40 ? "部分匹配，补强后可投" : "差距较大，谨慎投递";
    const ringColor = score >= 70 ? "var(--hit)" : score >= 40 ? "var(--partial)" : "var(--miss)";

    return (
      <>
        <div className="view-head">
          <div className="spread">
            <h1>
              🔎 {openJD.company || "未知公司"} · {openJD.title || "未命名岗位"}
            </h1>
            <div className="row">
              <button type="button" className="btn" onClick={() => setOpenId(null)}>
                ← 返回列表
              </button>
              <button
                type="button"
                className="btn clay"
                onClick={() => {
                  addApp({
                    company: openJD.company,
                    title: openJD.title,
                    status: "待投递",
                    note: "",
                    jdId: openJD.id,
                  });
                  setNotice("已加入投递看板");
                }}
              >
                📮 加入投递
              </button>
              <Link className="btn primary" href="/optimize">
                📝 去定制简历
              </Link>
            </div>
          </div>
          <p>拆解基于本地规则词典，离线可用。匹配度只作参考。</p>
        </div>

        {notice ? <div className="warnbox mb12">{notice}</div> : null}

        <div className="cards" style={{ gridTemplateColumns: "260px 1fr" }}>
          <div className="card" style={{ textAlign: "center" }}>
            <div
              className="ring"
              style={{
                background: `conic-gradient(${ringColor} ${score * 3.6}deg, var(--surface-nested) 0deg)`,
              }}
            >
              <span>{score}</span>
            </div>
            <div className="tiny mt8">技能匹配度（本地启发式，仅供参考）</div>
            <div className="mt12">
              <span className={`tag ${tone}`}>{verdict}</span>
            </div>
          </div>

          <div className="card">
            <h3>高频关键词</h3>
            <div>
              {analysis.keywords.length > 0 ? (
                analysis.keywords.map((word) => (
                  <span key={word} className="chip">
                    {word}
                  </span>
                ))
              ) : (
                <span className="tiny">未提取到</span>
              )}
            </div>

            <h3 className="mt12">逐条技能比对</h3>
            <table className="t">
              <thead>
                <tr>
                  <th>关键词</th>
                  <th style={{ width: 70 }}>状态</th>
                  <th>简历证据</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((item) => (
                  <tr key={item.k}>
                    <td>{item.k}</td>
                    <td>
                      <span className="tag hit">命中</span>
                    </td>
                    <td className="tiny">{item.ev}</td>
                  </tr>
                ))}
                {partial.map((item) => (
                  <tr key={item.k}>
                    <td>{item.k}</td>
                    <td>
                      <span className="tag partial">相关</span>
                    </td>
                    <td className="tiny">有近似技能，可在简历中建立关联表述</td>
                  </tr>
                ))}
                {missing.map((word) => (
                  <tr key={word}>
                    <td>{word}</td>
                    <td>
                      <span className="tag miss">缺口</span>
                    </td>
                    <td className="tiny">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card mt16">
          <div className="spread">
            <h3>投递信息</h3>
            <span className="tiny">从原文里自动提取，可直接复制</span>
          </div>

          <div className="split mt8">
            <div className="copyrow">
              <span className="k">公司</span>
              <span className="v">{analysis.info.company || "—"}</span>
            </div>
            <div className="copyrow">
              <span className="k">岗位</span>
              <span className="v">{analysis.info.title || "—"}</span>
            </div>
            <div className="copyrow">
              <span className="k">城市</span>
              <span className="v">{analysis.info.city || "—"}</span>
            </div>
            <div className="copyrow">
              <span className="k">投递邮箱</span>
              <span className="v">{analysis.info.email || "—"}</span>
              {analysis.info.email ? (
                <button type="button" className="btn sm" onClick={() => copy(analysis.info.email, "邮箱")}>
                  复制
                </button>
              ) : null}
            </div>
          </div>

          <div className="copyrow">
            <span className="k">简历命名格式</span>
            <span className="v">{analysis.info.namingFormat || "—"}</span>
            {analysis.info.namingFormat ? (
              <button
                type="button"
                className="btn sm"
                onClick={() => copy(analysis.info.namingFormat, "命名格式")}
              >
                复制
              </button>
            ) : null}
          </div>
        </div>

        <div className="split mt16">
          <div className="card">
            <h3>岗位职责</h3>
            {analysis.duties.length > 0 ? (
              <ul className="muted" style={{ paddingLeft: 18, fontSize: 13 }}>
                {analysis.duties.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <div className="tiny">未识别到职责段落。</div>
            )}
          </div>
          <div className="card">
            <h3>任职要求</h3>
            {analysis.reqs.length > 0 ? (
              <ul className="muted" style={{ paddingLeft: 18, fontSize: 13 }}>
                {analysis.reqs.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <div className="tiny">未识别到要求段落。</div>
            )}
            {analysis.preferred.length > 0 ? (
              <>
                <h3 className="mt12">优先 / 加分项</h3>
                <ul className="muted" style={{ paddingLeft: 18, fontSize: 13 }}>
                  {analysis.preferred.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="view-head">
        <h1>🔎 JD 拆解器</h1>
        <p>粘贴岗位原文：提取关键词与职责要求，逐条比对你的技能，并可一键加入投递或去定制简历。</p>
      </div>

      <div className="split">
        <div className="card">
          <h3>粘贴新的 JD</h3>
          <input
            className="input"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            placeholder="公司（可留空，自动猜测）"
          />
          <input
            className="input mt8"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="岗位名称（可留空，自动猜测）"
          />
          <label className="fl">或者从网址读取</label>
          <div className="row">
            <input
              className="input"
              style={{ flex: 1, minWidth: 180 }}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
            />
            <button type="button" className="btn" onClick={handleFetch} disabled={fetching || ocrBusy}>
              {fetching ? "读取中…" : "读取链接"}
            </button>
            <label
              className="btn"
              style={{ cursor: ocrBusy ? "not-allowed" : "pointer", opacity: ocrBusy ? 0.45 : 1 }}
            >
              {ocrBusy ? "识别中…" : "🖼 上传截图识别"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={ocrBusy}
                onChange={(event) => {
                  const files = event.target.files;
                  event.target.value = "";
                  if (files && files.length > 0) void handleOcr(files);
                }}
              />
            </label>
          </div>
          <div className="tiny mt8">
            读取链接由服务端执行，只能打开公开页面；正文是图片时会自动 OCR。
            需要登录或带验证码的站点读不到，可以截图后用右边的按钮识别。一次最多 10 张。
          </div>

          <textarea
            className="input mt8"
            style={{ height: 300 }}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder="把 JD 全文粘贴到这里，包括岗位职责与任职要求……"
          />
          <div className="row mt8">
            <button type="button" className="btn primary" onClick={runParse}>
              本地即时拆解
            </button>
            <button type="button" className="btn" disabled>
              ✨ AI 增强拆解
            </button>
          </div>
          <div className="tiny mt8">
            本地拆解基于规则词典，离线可用。AI 增强待成员 C 的接口接入后启用。
          </div>
          {notice ? <div className="tiny mt8 warn-text">{notice}</div> : null}
        </div>

        <div className="card">
          <div className="spread">
            <h3>已拆解 JD</h3>
            <span className="tiny">{jds.length} 条</span>
          </div>

          {jds.length === 0 ? (
            <div className="empty mt8">
              <span className="big">📭</span>
              还没有 JD，先在左侧粘贴一份。
            </div>
          ) : (
            <div>
              {jds
                .slice()
                .reverse()
                .map((item) => (
                  <div key={item.id} className="copyrow">
                    <div className="v">
                      <b>{item.company || "未知公司"}</b>
                      <span className="muted"> · {item.title || "未命名岗位"}</span>
                      <div className="tiny">{item.keywords.slice(0, 6).join(" · ") || "未提取到关键词"}</div>
                    </div>
                    <button type="button" className="btn sm" onClick={() => setOpenId(item.id)}>
                      查看
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {profile.skills.length === 0 ? (
        <div className="warnbox mt16">
          你的技能标签还是空的，比对结果会全部落在缺口。先到「简历解析」上传或粘贴简历建立画像。
        </div>
      ) : null}
    </>
  );
}
