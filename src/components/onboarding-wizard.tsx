"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Step = {
  id: string;
  label: string;
  done: boolean;
  href: string | null;
  optional?: boolean;
};

type OnboardingData = {
  dismissed: boolean;
  steps: Step[];
  completedRequired: number;
  totalRequired: number;
  allRequiredDone: boolean;
};

export function OnboardingWizard() {
  const [data, setData] = useState<OnboardingData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch("/api/onboarding", { cache: "no-store" });
    const j = await r.json();
    if (!j.ok) return;
    setData({
      dismissed: j.dismissed,
      steps: j.steps,
      completedRequired: j.completedRequired,
      totalRequired: j.totalRequired,
      allRequiredDone: j.allRequiredDone,
    });
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
    const t = setInterval(() => void load(), 12000);
    return () => clearInterval(t);
  }, [load]);

  async function dismiss() {
    await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss" }),
    });
    setData((d) => (d ? { ...d, dismissed: true } : d));
  }

  if (loading || !data) return null;
  if (data.dismissed && data.allRequiredDone) return null;

  const pct =
    data.totalRequired > 0
      ? Math.round((data.completedRequired / data.totalRequired) * 100)
      : 0;

  return (
    <div className="card onboarding-card">
      <div className="section-head">
        <div>
          <h2>Primeiros passos</h2>
          <p className="muted" style={{ margin: 0 }}>
            {data.allRequiredDone
              ? "Tudo pronto para prospectar. O Agente IA é opcional."
              : `${data.completedRequired}/${data.totalRequired} passos · ${pct}%`}
          </p>
        </div>
        {data.allRequiredDone ? (
          <button type="button" className="btn ghost small" onClick={() => void dismiss()}>
            Ocultar
          </button>
        ) : null}
      </div>

      <ol className="onboarding-steps">
        {data.steps.map((step, i) => (
          <li
            key={step.id}
            className={`onboarding-step ${step.done ? "done" : ""} ${step.optional ? "optional" : ""}`}
          >
            <span className="onboarding-num">{step.done ? "✓" : i + 1}</span>
            <span className="onboarding-label">
              {step.label}
              {step.optional ? (
                <span className="muted" style={{ marginLeft: 6 }}>(opcional)</span>
              ) : null}
            </span>
            {step.href && !step.done ? (
              <Link className="btn secondary small" href={step.href}>
                Ir
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
