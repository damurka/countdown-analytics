import React from "react";
import { InputAdapter } from "@/shiny.react";
import { tr, useLang } from "../lang";
import type { LocalText } from "../lang";


export interface WizardStep {
  key: string;
  label: LocalText;
  status: "locked" | "available" | "current" | "complete";
}

export interface WizardStepsProps {
  id?: string;
  steps: WizardStep[];
  value?: string | null;
  onChange?: (key: string) => void;
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

function WizardSteps({ steps, onChange }: WizardStepsProps) {
  const lang = useLang();

  return (
    <div className="cd-wizard-rail" role="tablist">
      {steps.map((step, i) => (
        <React.Fragment key={step.key}>
          {i > 0 && (
            <div
              className={`cd-wizard-rail__line${steps[i - 1].status === "complete" ? " cd-wizard-rail__line--filled" : ""}`}
            />
          )}
          <button
            type="button"
            role="tab"
            aria-selected={step.status === "current"}
            aria-disabled={step.status === "locked"}
            disabled={step.status === "locked"}
            className={`cd-wizard-rail__item cd-wizard-rail__item--${step.status}`}
            onClick={() => onChange && step.status !== "locked" && onChange(step.key)}
          >
            <span className="cd-wizard-rail__circle">
              {step.status === "complete" ? <CheckIcon /> : step.status === "locked" ? <LockIcon /> : i + 1}
            </span>
            <span className="cd-wizard-rail__label">{tr(step.label, lang)}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

export default InputAdapter<WizardStepsProps, string>(WizardSteps, (value, setValue) => ({
  value,
  onChange: (key: string) => setValue(key),
}));
