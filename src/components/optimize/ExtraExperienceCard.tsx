"use client";

import { useState } from "react";

/**
 * 早期版本在复制时会往开头加这个标记，方便在记事本里认出这段文字。
 * 但粘回输入框时那几个字很碍事，已经取消：复制什么就是什么，不加任何前缀。
 *
 * 这里保留一段清理逻辑，专门处理之前已经存到记事本、带着标记的老内容。
 */
const LEGACY_MARK = "【JobAgent 其他经历】";

function stripLegacyMark(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith(LEGACY_MARK)) return text;
  return trimmed.slice(LEGACY_MARK.length).replace(/^\r?\n/, "");
}

/**
 * 复制到剪贴板的兼容写法。
 *
 * navigator.clipboard 只在安全上下文（localhost、127.0.0.1 或 https）下可用，
 * 用局域网 IP 打开页面时它是 undefined。这时退回旧的选中+复制方式。
 */
function fallbackCopy(text: string): boolean {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

type ExtraExperienceCardProps = {
  value: string;
  onChange: (next: string) => void;
};

/**
 * 「其他经历」输入区。
 *
 * 简历里通常只挑了一部分经历写，可能有更适合目标岗位的经历没写进去，
 * 用户在这里补上，改写时会和简历一起作为材料。
 *
 * 数据不存储：剪贴板是唯一的留存方式，所以下面把这件事写清楚。
 */
export function ExtraExperienceCard({ value, onChange }: ExtraExperienceCardProps) {
  const [status, setStatus] = useState("");
  const [failed, setFailed] = useState(false);

  function report(message: string, isError = false) {
    setStatus(message);
    setFailed(isError);
  }

  /** 复制：把输入框里的文字整段放进剪贴板。 */
  async function copy() {
    const text = value.trim();
    if (text.length === 0) {
      report("输入框还是空的，没有可复制的内容。", true);
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        report(`已复制 ${text.length} 个字。请立刻粘贴到记事本或收藏里保存，剪贴板只保留最后一次复制的内容。`);
        return;
      } catch {
        // 继续走下面的兼容写法
      }
    }

    if (fallbackCopy(text)) {
      report(`已复制 ${text.length} 个字（兼容模式）。请立刻粘贴到记事本保存。`);
      return;
    }

    report("浏览器不允许自动复制。请手动全选下面的文字，按 Ctrl+C 复制。", true);
  }

  /** 把剪贴板内容追加到输入框末尾，不覆盖已有文字。 */
  async function paste() {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
      report(
        "当前地址读不到剪贴板（浏览器只在 localhost、127.0.0.1 或 https 下开放这个能力）。请手动把光标点到输入框里按 Ctrl+V。",
        true,
      );
      return;
    }

    let raw = "";
    try {
      raw = await navigator.clipboard.readText();
    } catch {
      report("读取剪贴板被浏览器拒绝了。可以手动把光标点到输入框里按 Ctrl+V，效果一样。", true);
      return;
    }

    const incoming = stripLegacyMark(raw).trim();
    if (incoming.length === 0) {
      report("剪贴板里没有可用的文字。", true);
      return;
    }

    const existing = value.trim();
    if (existing.length > 0 && existing.includes(incoming)) {
      report("这段内容已经在输入框里了，没有重复添加。");
      return;
    }

    onChange(existing.length > 0 ? `${existing}\n${incoming}` : incoming);
    report(`已追加 ${incoming.length} 个字，原有的内容保留在输入框里。`);
  }

  return (
    <div className="card mt12">
      <div className="spread">
        <h3>🧩 其他经历</h3>
        <span className="tiny">{value.trim().length} 字</span>
      </div>

      <p className="tiny">
        简历里通常只挑了一部分经历写。如果有更适合目标岗位、但没写进简历的经历，
        填在这里，改写时会和简历一起作为材料。
      </p>

      <textarea
        className="input mt8"
        style={{ height: 160 }}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          if (status) report("");
        }}
        placeholder={"一行一条，写清做了什么即可。例如：\n帮导师做过一个关于 ESG 的课题\n在学生会负责过一场校级活动的策划与执行"}
      />

      <div className="row mt8">
        <button type="button" className="btn" onClick={copy}>
          📋 复制
        </button>
        <button type="button" className="btn" onClick={paste}>
          📥 粘贴
        </button>
      </div>

      {status ? (
        <div className={failed ? "errbox mt8" : "tiny mt8 warn-text"}>{status}</div>
      ) : null}

      <div className="tiny mt8">
        这些内容只存在当前标签页里，关闭标签页即自动清除，不会上传到我们自己的服务器。
        想长期保留，可以点上方「复制」存到自己的记事本。
      </div>
      <div className="tiny mt4">
        注意：点「AI 逐段改写」时，内容会和简历、JD 一起发送给 AI 模型处理。
      </div>
    </div>
  );
}
