import { useRef, useState } from "react";

export default function Dropzone({ onFile, accept = ".tex,.pdf", disabled = false }) {
  const inputRef = useRef(null);
  const [dragover, setDragover] = useState(false);

  function handleFiles(files) {
    if (disabled) return;
    const file = files && files[0];
    if (file) onFile(file);
  }

  return (
    <div
      className={`dropzone ${dragover ? "is-dragover" : ""}`}
      onClick={() => !disabled && inputRef.current && inputRef.current.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragover(true);
      }}
      onDragLeave={() => setDragover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragover(false);
        handleFiles(e.dataTransfer.files);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && inputRef.current) inputRef.current.click();
      }}
      aria-disabled={disabled}
    >
      <div className="dropzone__icon" aria-hidden="true">
        ⬆
      </div>
      <div>
        <strong>Drop your resume here</strong> or click to browse
      </div>
      <div className="dropzone__hint">Accepts .tex (LaTeX source) or .pdf</div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
