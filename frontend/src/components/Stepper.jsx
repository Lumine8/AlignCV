import { useLocation } from "react-router-dom";

const STEPS = [
  { key: "workspace", label: "Resume & Job", to: "/workspace" },
  { key: "report", label: "Match Report", to: "/report" },
  { key: "editor", label: "Review", to: "/editor" },
  { key: "export", label: "Compile & Export", to: "/export" },
];

export default function Stepper({ completed = [] }) {
  const location = useLocation();
  const currentIndex = Math.max(
    0,
    STEPS.findIndex((s) => location.pathname.startsWith(s.to))
  );

  return (
    <div className="stepper" role="navigation" aria-label="Workflow steps">
      {STEPS.map((step, index) => {
        const isActive = index === currentIndex;
        const isDone = completed.includes(step.key) || index < currentIndex;
        return (
          <div
            key={step.key}
            className={`stepper__item ${isActive ? "active" : ""} ${isDone ? "done" : ""}`}
          >
            <span className="stepper__num">{isDone ? "✓" : index + 1}</span>
            {step.label}
          </div>
        );
      })}
    </div>
  );
}
