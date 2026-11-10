"use client";

type ResumeUploadProps = {
  fileName: string;
  onSelect: (file: File) => void;
  disabled: boolean;
};

/**
 * 上传按钮。样式和参考页的普通按钮一致，内部包一个隐藏的文件输入。
 * 选完文件后清空 input 的值，这样同一个文件再选一次也能触发。
 */
export function ResumeUpload({ fileName, onSelect, disabled }: ResumeUploadProps) {
  return (
    <label
      className="btn"
      style={{
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        position: "relative",
        overflow: "hidden",
      }}
    >
      📄 上传 PDF / DOCX 提取
      <input
        type="file"
        accept=".pdf,.docx"
        disabled={disabled}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onSelect(file);
        }}
      />
      {fileName ? <span className="tiny">{fileName}</span> : null}
    </label>
  );
}
