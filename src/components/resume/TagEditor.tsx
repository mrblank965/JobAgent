"use client";

import { useState } from "react";

type TagEditorProps = {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
  emptyHint: string;
};

/**
 * 标签式编辑器，用于技能和优势。
 *
 * 它不带卡片外壳，直接嵌在结构化画像卡片里，和参考页的写法一致。
 * 输入后按回车或点添加按钮加入，点标签上的叉逐个删除，重复内容不会重复加入。
 */
export function TagEditor({ label, items, onChange, placeholder, emptyHint }: TagEditorProps) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");

  function addItem() {
    const value = draft.trim();
    if (value.length === 0) {
      setNotice("请先输入内容再添加。");
      return;
    }
    if (items.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setNotice(`${value} 已经在列表里，没有重复加入。`);
      return;
    }
    onChange([...items, value]);
    setDraft("");
    setNotice("");
  }

  function removeItem(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
    setNotice("");
  }

  return (
    <div>
      <label className="fl">
        {label}
        <span className="tiny" style={{ marginLeft: 6 }}>
          {items.length} 项
        </span>
      </label>

      {items.length === 0 ? (
        <div className="tiny">{emptyHint}</div>
      ) : (
        <div>
          {items.map((item, index) => (
            <span key={`${item}-${index}`} className="chip hit">
              {item}
              <span className="x" onClick={() => removeItem(index)} role="button" aria-label={`删除 ${item}`}>
                ×
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="row mt8">
        <input
          className="input"
          style={{ flex: 1 }}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (notice) setNotice("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addItem();
            }
          }}
          placeholder={placeholder}
        />
        <button type="button" className="btn" onClick={addItem}>
          添加
        </button>
      </div>

      {notice ? <div className="tiny mt8 warn-text">{notice}</div> : null}
    </div>
  );
}
