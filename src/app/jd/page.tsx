"use client";

import Link from "next/link";
import { useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { DutyBreakdown } from "@/components/jd/DutyBreakdown";
import { ItemList } from "@/components/jd/ItemList";
import type { JDDutyBreakdown } from "@/lib/ai/jd";
import { analyzeJD, extractJDInfo } from "@/lib/jd";
import { useStore } from "@/lib/store";

/** 一次最多识别这么多张截图，跟服务端的上限保持一致。 */
const MAX_SHOTS = 10;

export default function JDPage() {
  const { ai, profile, jds, addJD, removeJD, updateJD, addApp } = useStore();

  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [raw, setRaw] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  /** 拆解结果按 JD id 缓存，切回同一份 JD 时不再重复调用模型。 */
  const [breakdowns, setBreakdowns] = useState<Record<string, JDDutyBreakdown>>({});
  const [notice, setNotice] = useState("");
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  /** 粘贴进来的 JD 截图。按下拆解时才转文字，转完就走跟粘贴文字一样的流程。 */
  const [shots, setShots] = useState<{ file: File; preview: string }[]>([]);
  /** 每个 JD 是用哪种方式拆的。本地拆解绝不碰大模型，只有 AI 增强才调。 */
  const [aiMode, setAiMode] = useState<Record<string, boolean>>({});
  /** 列表里的搜索词，按公司或岗位名过滤。 */
  const [query, setQuery] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  /** 把图片读成预览图，读不出来也不报错，只是没有缩略图。 */
  function readPreviews(files: File[]) {
    return Promise.all(
      files.map(
        (file) =>
          new Promise<{ file: File; preview: string }>((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({ file, preview: typeof reader.result === "string" ? reader.result : "" });
            reader.onerror = () => resolve({ file, preview: "" });
            reader.readAsDataURL(file);
          }),
      ),
    );
  }

  /** 收下截图，只留图片，最多 10 张。 */
  async function addShots(files: File[]) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;

    const room = MAX_SHOTS - shots.length;
    if (room <= 0) {
      setNotice(`一次最多 ${MAX_SHOTS} 张截图，先拆解或清空再加。`);
      return;
    }

    const loaded = await readPreviews(images.slice(0, room));
    if (images.length > room) setNotice(`一次最多 ${MAX_SHOTS} 张截图，只收下了前 ${room} 张。`);
    setShots((prev) => [...prev, ...loaded]);
  }

  /** 在文本框里粘贴。剪贴板里是图片就收下，是文字就照常粘进文本框。 */
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files: File[] = [];

    for (const item of Array.from(event.clipboardData.items)) {
      if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }

    if (files.length === 0) return;

    event.preventDefault();
    void addShots(files);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void addShots(Array.from(event.dataTransfer.files));
  }

  /**
   * 送识别之前先把图处理一遍：放大、转灰度、拉开对比度，深色底的反相。
   * 截图里的字往往又小又淡，直接丢给识别引擎很容易认错。
   * 处理不了就退回原图，别因为预处理把整件事卡住。
   */
  async function enhanceForOcr(file: File): Promise<File> {
    try {
      const bitmap = await createImageBitmap(file);

      // 小图放大两倍，识别引擎对太小的字很吃力；长边封顶，免得图太大反而拖慢
      const width = Math.min(Math.round(bitmap.width * (bitmap.width < 1400 ? 2 : 1)), 2200);
      const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) return file;

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      const image = context.getImageData(0, 0, width, height);
      const data = image.data;

      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      }
      // 深色底的截图先反相，识别引擎认浅底黑字更准
      const invert = total / (data.length / 4) < 110;

      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // 把偏灰的像素推向黑或白，笔画边界更清楚
        const value = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
        const final = invert ? 255 - value : value;
        data[i] = final;
        data[i + 1] = final;
        data[i + 2] = final;
      }
      context.putImageData(image, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return file;

      return new File([blob], file.name || "shot.png", { type: "image/png" });
    } catch {
      return file;
    }
  }

  /** 把截图交给服务端做文字识别，成功返回文字，失败返回空串。 */
  async function recognizeShots(): Promise<string> {
    setOcrBusy(true);
    setNotice(`正在识别 ${shots.length} 张截图，首次使用要先下载中文语言包，请稍候……`);

    try {
      const formData = new FormData();
      for (const shot of shots) formData.append("images", await enhanceForOcr(shot.file));

      const response = await fetch("/api/ocr", { method: "POST", body: formData });
      const payload = (await response.json()) as {
        text?: string;
        error?: string;
        pages?: { index: number; chars: number; confidence: number }[];
      };

      if (!response.ok || typeof payload.text !== "string") {
        setNotice(payload.error ?? "识别失败，请换清晰的截图重试。");
        return "";
      }

      setRaw(payload.text);

      const weak = (payload.pages ?? []).filter((page) => page.confidence < 70);
      const base = `已识别 ${payload.pages?.length ?? 0} 张，共 ${payload.text.length} 个字。`;
      setNotice(
        weak.length > 0
          ? `${base} 第 ${weak.map((page) => page.index).join("、")} 张置信度偏低，错字可能较多。`
          : base,
      );

      return payload.text;
    } catch {
      setNotice("无法连接服务器，请确认开发服务器仍在运行。");
      return "";
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

  /**
   * 拆解一份 JD。
   *
   * local 只跑本地规则，不联网也不用 Key；ai 才会调用首页配的模型做六层拆解。
   * 文本框空着但贴了截图时，先做文字识别，再走跟粘贴文字完全一样的流程。
   */
  async function runParse(mode: "local" | "ai") {
    let text = raw.trim();
    let keepNotice = false;

    if (text.length < 20 && shots.length > 0) {
      text = (await recognizeShots()).trim();

      if (text.length < 20) {
        setNotice("截图里没认出足够的文字，换张清晰点的图，或者把 JD 文字直接粘进下面的框。");
        return;
      }

      keepNotice = true;
    } else if (text.length >= 20 && shots.length > 0) {
      setNotice("文本框里已经有文字，这次按文字拆解，贴的截图没用上。");
      keepNotice = true;
    }

    if (text.length < 20) {
      setNotice("JD 太短，至少 20 个字，或者贴一张 JD 截图再拆解。");
      return;
    }

    const info = extractJDInfo(text);
    const id = addJD({
      company: company.trim() || info.company,
      title: title.trim() || info.title,
      raw: text,
      keywords: analyzeJD(text, profile.skills, "").keywords,
    });

    setAiMode((prev) => ({ ...prev, [id]: mode === "ai" }));
    setOpenId(id);
    setCompany("");
    setTitle("");
    setRaw("");
    setShots([]);

    if (!keepNotice) {
      setNotice(
        mode === "ai" && ai.apiKey.trim().length === 0
          ? "还没配 Key，先去首页的「AI 设置」填上再回来看 AI 增强拆解。这次先按本地规则展示。"
          : "",
      );
    }
  }

  const openJD = jds.find((item) => item.id === openId) ?? null;
  const analysis = openJD ? analyzeJD(openJD.raw, profile.skills, "") : null;

  // 列表按新到旧排。搜索词匹配三处：公司名、岗位名，以及下面那行小字里的关键词
  const keyword = query.trim().toLowerCase();
  const matchedJDs = jds
    .slice()
    .reverse()
    .filter((item) => {
      if (keyword === "") return true;

      const haystack = `${item.company} ${item.title} ${item.keywords.join(" ")}`.toLowerCase();
      return haystack.includes(keyword);
    });

  if (openJD && analysis) {
    const { score, hits, partial, missing } = analysis.match;
    const tone = score >= 70 ? "hit" : score >= 40 ? "partial" : "miss";
    const verdict =
      score >= 70 ? "高度匹配，建议优先投" : score >= 40 ? "部分匹配，补强后可投" : "差距较大，谨慎投递";
    const ringColor = score >= 70 ? "var(--hit)" : score >= 40 ? "var(--partial)" : "var(--miss)";

    // AI 拆解给出来的投递信息优先，哪个字段没给就用本地提取的那个字段补。
    // 公司和岗位直接用记录里的值：AI 拆完已经写回去了，列表、标题、这里读的是同一个
    const aiInfo = breakdowns[openJD.id]?.info;
    const info = {
      company: openJD.company,
      title: openJD.title,
      city: aiInfo?.city || analysis.info.city,
      workplace: aiInfo?.workplace || analysis.info.workplace,
      workTime: aiInfo?.workTime || analysis.info.workTime,
      email: aiInfo?.email || analysis.info.email,
      namingFormat: aiInfo?.namingFormat || analysis.info.namingFormat,
    };

    // 三栏要么整块用 AI 的，要么整块用本地的。混着来会让同一条要求两边都出现
    const aiReqs = breakdowns[openJD.id]?.requirements;
    const reqs = aiReqs ?? analysis.reqs;

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
          </div>

          <div className="split mt8">
            <div className="copyrow">
              <span className="k">公司</span>
              <span className="v">{info.company || "—"}</span>
            </div>
            <div className="copyrow">
              <span className="k">岗位</span>
              <span className="v">{info.title || "—"}</span>
            </div>
            <div className="copyrow">
              <span className="k">城市</span>
              <span className="v">{info.city || "—"}</span>
            </div>
            <div className="copyrow">
              <span className="k">投递邮箱</span>
              <span className="v">{info.email || "—"}</span>
              {info.email ? (
                <button type="button" className="btn sm" onClick={() => copy(info.email, "邮箱")}>
                  复制
                </button>
              ) : null}
            </div>
          </div>

          <div className="copyrow">
            <span className="k">工作地点</span>
            <span className="v">{info.workplace || "—"}</span>
            {info.workplace ? (
              <button
                type="button"
                className="btn sm"
                onClick={() => copy(info.workplace, "工作地点")}
              >
                复制
              </button>
            ) : null}
          </div>

          <div className="copyrow">
            <span className="k">工作时间</span>
            <span className="v">{info.workTime || "—"}</span>
            {info.workTime ? (
              <button
                type="button"
                className="btn sm"
                onClick={() => copy(info.workTime, "工作时间")}
              >
                复制
              </button>
            ) : null}
          </div>

          <div className="copyrow">
            <span className="k">简历命名格式</span>
            <span className="v">{info.namingFormat || "—"}</span>
            {info.namingFormat ? (
              <button
                type="button"
                className="btn sm"
                onClick={() => copy(info.namingFormat, "命名格式")}
              >
                复制
              </button>
            ) : null}
          </div>
        </div>

        <div className="card mt16">
          <div className="spread">
            <h3>岗位职责</h3>
          </div>
          <DutyBreakdown
            rawText={openJD.raw}
            value={breakdowns[openJD.id] ?? null}
            onLoaded={(data) => {
              setBreakdowns((prev) => ({ ...prev, [openJD.id]: data }));

              // AI 认出来的公司名和岗位名写回这条记录本身。
              // 拆解结果只存在这个页面的内存里，简历定制、投递看板那些页面看不见，
              // 只有写回 store 它们才拿得到，否则那边会一直显示"未知公司"
              const local = extractJDInfo(openJD.raw);
              const next = {
                company: data.info?.company || local.company || openJD.company,
                title: data.info?.title || local.title || openJD.title,
              };

              if (next.company !== openJD.company || next.title !== openJD.title) {
                updateJD(openJD.id, next);
              }
            }}
            fallback={analysis.duties}
            auto={aiMode[openJD.id] ?? false}
          />
        </div>

        <div className="card mt16">
          <div className="spread">
            <h3>任职要求</h3>
          </div>

          <h3 className="mt12">能力与经历要求</h3>
          <ItemList items={reqs.ability} empty="未识别到这类要求。" />

          <h3 className="mt12">到岗与时长要求</h3>
          <ItemList items={reqs.schedule} empty="未识别到这类要求。" />
        </div>

        <div className="card mt16">
          <div className="spread">
            <h3>其他信息</h3>
          </div>
          <ItemList items={reqs.other} empty="未识别到这类信息。" />
        </div>

        <div className="card mt16">
          <div className="spread">
            <h3>JD 原文</h3>
            <button type="button" className="btn sm" onClick={() => copy(openJD.raw, "JD 原文")}>
              复制
            </button>
          </div>
          <div className="tiny">上面各块都是从这里拆出来的，对不上时以原文为准。</div>
          <div
            className="muted"
            style={{
              marginTop: 8,
              padding: "10px 12px",
              maxHeight: 420,
              overflowY: "auto",
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.9,
              background: "var(--surface-nested)",
              borderRadius: 8,
            }}
          >
            {openJD.raw}
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
          </div>
          <div className="tiny mt8">
            读取链接由服务端执行，只能打开公开页面；正文是图片时会自动 OCR。
            需要登录或带验证码的站点读不到，可以截图后贴到下面那个框里。
          </div>

          <label className="fl">本地上传图片</label>
          <div
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            onClick={() => fileRef.current?.click()}
            style={{
              marginTop: 6,
              border: "1px dashed var(--border)",
              borderRadius: 8,
              padding: "16px 12px",
              background: "var(--surface-nested)",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 22, lineHeight: 1.2 }}>🖼</div>
            <div className="tiny" style={{ marginTop: 6 }}>
              点这里选图片，或者把图片拖进来
            </div>
            <div className="tiny">一次最多 {MAX_SHOTS} 张，按下拆解时先转成文字</div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={ocrBusy}
            onChange={(event) => {
              const files = event.target.files;
              event.target.value = "";
              if (files && files.length > 0) void addShots(Array.from(files));
            }}
          />

          <label className="fl">粘贴图片或者文字</label>
          <textarea
            className="input mt8"
            style={{ height: 260 }}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            onPaste={handlePaste}
            placeholder="在这里按 Ctrl+V：贴 JD 截图会先转成文字，贴 JD 文字就直接拆解。"
          />

          {shots.length > 0 ? (
            <div
              style={{
                marginTop: 8,
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 10,
                background: "var(--surface-nested)",
              }}
            >
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                {shots.map((shot, index) => (
                  // 缩略图是本地生成的 data URL，不走 next/image 的优化
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={index}
                    src={shot.preview}
                    alt={`图片 ${index + 1}`}
                    style={{
                      width: 84,
                      height: 84,
                      objectFit: "cover",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "#fff",
                    }}
                  />
                ))}
              </div>
              <div className="row mt8">
                <span className="tiny">待识别 {shots.length} 张，按下拆解时先转成文字</span>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setShots([])}
                  disabled={ocrBusy}
                >
                  清空
                </button>
              </div>
            </div>
          ) : null}
          <div className="row mt8">
            <button
              type="button"
              className="btn primary"
              onClick={() => void runParse("local")}
              disabled={ocrBusy}
            >
              {ocrBusy ? "识别中…" : "本地即时拆解"}
            </button>
            <button
              type="button"
              className="btn clay"
              onClick={() => void runParse("ai")}
              disabled={ocrBusy}
            >
              ✨ AI 增强拆解
            </button>
          </div>
          <div className="tiny mt8">
            本地拆解只按规则词典切分，不联网也不用 Key。AI 增强拆解会调用你在首页配置的模型，
            把每条职责拆到六层，需要先填 Key。
          </div>
          {notice ? <div className="tiny mt8 warn-text">{notice}</div> : null}
        </div>

        <div className="card">
          <div className="spread">
            <h3>已拆解 JD</h3>
            <span className="tiny">{jds.length} 条</span>
          </div>

          <input
            className="input mt8"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜公司、岗位或关键词"
          />

          {jds.length === 0 ? (
            <div className="empty mt8">
              <span className="big">📭</span>
              还没有 JD，先在左侧粘贴一份。
            </div>
          ) : matchedJDs.length === 0 ? (
            <div className="empty mt8">
              <span className="big">🔍</span>
              没有匹配「{query.trim()}」的记录。
            </div>
          ) : (
            <div>
              {matchedJDs.map((item) => (
                <div key={item.id} className="copyrow">
                  <div className="v">
                    <b>{item.company || "未知公司"}</b>
                    <span className="muted"> · {item.title || "未命名岗位"}</span>
                    <div className="tiny">{item.keywords.slice(0, 6).join(" · ") || "未提取到关键词"}</div>
                  </div>
                  <button
                    type="button"
                    className="btn sm"
                    style={{ flexShrink: 0 }}
                    onClick={() => setOpenId(item.id)}
                  >
                    查看
                  </button>
                  <button
                    type="button"
                    className="btn sm danger"
                    style={{ flexShrink: 0 }}
                    onClick={() => removeJD(item.id)}
                  >
                    删除
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
