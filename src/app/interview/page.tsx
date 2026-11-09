"use client";

import Link from "next/link";
import { useState } from "react";
import { seedAsText, INTERVIEW_SEED } from "@/lib/interviewSeed";
import { useStore } from "@/lib/store";
import type { QuestionLevel } from "@/lib/store";

/** 全局题库在分组标签里用的名字，和五组固定练习题并列显示。 */
const BANK_GROUP = "我的题库";

const QUESTION_LEVEL_LABEL: Record<QuestionLevel, string> = {
  new: "未练",
  practicing: "在练",
  mastered: "熟练",
};

export default function InterviewPage() {
  const {
    interviews,
    setInterviewAnswer,
    customQuestions,
    importQuestions,
    setCustomAnswer,
    setQuestionLevel,
    removeCustomQuestion,
  } = useStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState("");
  const [bankText, setBankText] = useState("");
  const [notice, setNotice] = useState("");
  /** 只看还没练过的题。 */
  const [onlyUnpracticed, setOnlyUnpracticed] = useState(false);

  const active = interviews.find((item) => item.id === activeId) ?? interviews[0] ?? null;
  const groups = active ? Object.keys(active.groups) : [];
  const tabs = customQuestions.length > 0 ? [...groups, BANK_GROUP] : groups;
  const group = activeGroup && tabs.includes(activeGroup) ? activeGroup : tabs[0] ?? "";
  const showingBank = group === BANK_GROUP;
  const list = active && !showingBank ? active.groups[group] ?? [] : [];

  function handleImport() {
    const added = importQuestions(bankText);
    if (added > 0) {
      setBankText("");
      setNotice(`已导入 ${added} 道题，可以在下面的「${BANK_GROUP}」里作答。`);
      setActiveGroup(BANK_GROUP);
      return;
    }
    setNotice("没有识别到新的题目。一行一题，或用 1. / 2、/（1）/ 一、 这类编号分开都可以。");
  }

  return (
    <>
      <div className="view-head">
        <div className="spread">
          <h1>🎤 面试陪练</h1>
          {interviews.length > 0 ? <span className="tiny">{interviews.length} 份记录</span> : null}
        </div>
        <p>
          五组练习题，答案自动保存在本机浏览器，刷新后仍在。删除投递记录会同时删除对应的面试记录。
        </p>
      </div>

      <div className="card mb12">
        <div className="spread">
          <h3>导入题库</h3>
          <span className="tiny">题库全局共用，所有面试记录都能用</span>
        </div>
        <p className="tiny mt8">
          把题目粘进来，一行一题，或用 1. / 2、/（1）/ 一、 这类编号分开；同一道题重复导入会自动跳过。
        </p>
        <textarea
          className="input mt8"
          rows={4}
          value={bankText}
          onChange={(event) => setBankText(event.target.value)}
          placeholder={"例如：\n1. 为什么选择投行？\n2. 讲一次你独立完成的分析\n3. 如何看待近期的一次并购交易"}
        />
        <div className="row mt8">
          <button type="button" className="btn primary" onClick={handleImport} disabled={!bankText.trim()}>
            导入到题库
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const added = importQuestions(seedAsText());
              setNotice(
                added > 0
                  ? `已载入 ${added} 道示例题（共 ${INTERVIEW_SEED.length} 组，覆盖动机/行为/专业/行情/情景/反问）。`
                  : "示例题库已经在里面了，没有重复导入。",
              );
              setActiveGroup(BANK_GROUP);
            }}
          >
            📚 载入示例题库
          </button>
          <span className="tiny">当前题库 {customQuestions.length} 道题</span>
        </div>
        {notice ? <div className="tiny mt8 warn-text">{notice}</div> : null}
      </div>

      {interviews.length === 0 && customQuestions.length === 0 ? (
        <div className="empty">
          <span className="big">🎧</span>
          打开投递看板里的卡片详情，把「招聘阶段」改为「面试」，会自动生成五组练习题，再从详情里点「去面试陪练」回到这里。
          <div className="mt12">
            <Link className="btn primary" href="/board">
              去看板
            </Link>
          </div>
        </div>
      ) : (
        <>
          {active ? (
            <div className="card mb12">
              <div className="row">
                <span className="tiny">选择一场面试</span>
                {interviews.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`itab${item.id === active.id ? " active" : ""}`}
                    onClick={() => {
                      setActiveId(item.id);
                      setActiveGroup("");
                    }}
                  >
                    {item.company || "未知公司"} · {item.title || "未命名岗位"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {tabs.length > 0 ? (
            <div className="row mb12">
              {tabs.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={`itab${name === group ? " active" : ""}`}
                  onClick={() => setActiveGroup(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : null}

          {showingBank ? (
            <>
              <div className="row mb8">
                <button
                  type="button"
                  className={`itab${onlyUnpracticed ? " active" : ""}`}
                  onClick={() => setOnlyUnpracticed((current) => !current)}
                >
                  只看未练
                </button>
                <span className="tiny">
                  共 {customQuestions.length} 题，未练 {customQuestions.filter((qa) => !qa.level || qa.level === "new").length} 题
                </span>
              </div>

              {customQuestions
                .map((qa, index) => ({ qa, index }))
                .filter(({ qa }) => !onlyUnpracticed || !qa.level || qa.level === "new")
                .map(({ qa, index }) => (
                  <div key={`${qa.q}_${index}`} className="iq">
                    <div className="spread">
                      <div className="q">{qa.q}</div>
                      <div className="row gap8">
                        {(["new", "practicing", "mastered"] as QuestionLevel[]).map((level) => (
                          <button
                            key={level}
                            type="button"
                            className={`itab${(qa.level ?? "new") === level ? " active" : ""}`}
                            onClick={() => setQuestionLevel(index, level)}
                          >
                            {QUESTION_LEVEL_LABEL[level]}
                          </button>
                        ))}
                        <button
                          type="button"
                          className="btn sm danger"
                          onClick={() => removeCustomQuestion(index)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                    <textarea
                      className="input"
                      style={{ height: 110 }}
                      value={qa.a}
                      onChange={(event) => setCustomAnswer(index, event.target.value)}
                      placeholder="在这里写下你的答案，边想边打……"
                    />
                  </div>
                ))}
            </>
          )
            : list.map((qa, index) => (
                <div key={qa.q} className="iq">
                  <div className="q">{qa.q}</div>
                  <textarea
                    className="input"
                    style={{ height: 110 }}
                    value={qa.a}
                    onChange={(event) =>
                      active ? setInterviewAnswer(active.id, group, index, event.target.value) : undefined
                    }
                    placeholder="在这里写下你的答案，边想边打……"
                  />
                </div>
              ))}

          <div className="tiny mt12">
            五组固定题目由本地规则按公司名和岗位名生成，不调用模型；「{BANK_GROUP}」里是你自己导入的题目。
          </div>
        </>
      )}
    </>
  );
}
