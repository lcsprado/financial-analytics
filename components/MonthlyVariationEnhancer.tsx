"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type SeriesMode = "both" | "emitted" | "received";

type VariationPoint = {
  month: string;
  emitted: number | null;
  received: number | null;
};

const variationFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
  signDisplay: "exceptZero",
});

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function findChartPanel() {
  return Array.from(document.querySelectorAll<HTMLElement>(".panel")).find(
    (panel) => normalize(panel.querySelector(".panel-header h2")?.textContent ?? "") === "EMITIDO × RECEBIDO",
  ) ?? null;
}

function hideDifferenceCard() {
  document.querySelectorAll<HTMLElement>(".kpi-card").forEach((card) => {
    const title = normalize(card.querySelector(".kpi-title")?.textContent ?? "");
    if (title !== "DIFERENCA DO PERIODO") return;

    card.classList.add("kpi-difference-hidden");
    card.setAttribute("aria-hidden", "true");
    card.parentElement?.classList.add("kpi-grid-without-difference");
  });
}

function readMonthLabels(panel: HTMLElement) {
  const preferred = Array.from(
    panel.querySelectorAll<SVGTextElement>(".recharts-xAxis .recharts-cartesian-axis-tick-value"),
  );
  const fallback = Array.from(panel.querySelectorAll<SVGTextElement>(".recharts-xAxis text"));
  const labels = preferred.length ? preferred : fallback;

  return labels
    .map((label) => label.textContent?.trim() ?? "")
    .filter(Boolean);
}

function measureSeries(panel: HTMLElement, seriesIndex: number) {
  const bars = Array.from(panel.querySelectorAll<SVGGElement>("g.recharts-bar"));
  const bar = bars[seriesIndex];
  if (!bar) return [];

  const previousDisplay = bar.style.display;
  const previousVisibility = bar.style.visibility;
  bar.style.display = "";
  bar.style.visibility = "hidden";

  try {
    const preferred = Array.from(
      bar.querySelectorAll<SVGGraphicsElement>(".recharts-bar-rectangle > path, .recharts-bar-rectangle > rect"),
    );
    const fallback = Array.from(
      bar.querySelectorAll<SVGGraphicsElement>("path.recharts-rectangle, rect.recharts-rectangle"),
    );
    const shapes = preferred.length ? preferred : fallback;

    return shapes.map((shape) => {
      if (shape.tagName.toLocaleLowerCase("pt-BR") === "rect") {
        const height = Number(shape.getAttribute("height"));
        if (Number.isFinite(height)) return Math.max(0, height);
      }

      try {
        return Math.max(0, shape.getBBox().height);
      } catch {
        return 0;
      }
    });
  } finally {
    bar.style.display = previousDisplay;
    bar.style.visibility = previousVisibility;
  }
}

function calculateVariation(current: number | undefined, previous: number | undefined) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || !previous || previous <= 0) return null;
  return (((current ?? 0) - previous) / previous) * 100;
}

function readVariations(panel: HTMLElement): VariationPoint[] {
  const months = readMonthLabels(panel);
  const emitted = measureSeries(panel, 0);
  const received = measureSeries(panel, 1);
  const count = Math.min(months.length, Math.max(emitted.length, received.length));
  const points: VariationPoint[] = [];

  for (let index = 1; index < count; index += 1) {
    const emittedVariation = calculateVariation(emitted[index], emitted[index - 1]);
    const receivedVariation = calculateVariation(received[index], received[index - 1]);

    if (emittedVariation === null && receivedVariation === null) continue;

    points.push({
      month: months[index],
      emitted: emittedVariation,
      received: receivedVariation,
    });
  }

  return points;
}

function formatVariation(value: number) {
  return `${variationFormatter.format(value)}%`;
}

function variationTone(value: number) {
  if (value > 0.05) return "positive";
  if (value < -0.05) return "negative";
  return "neutral";
}

function MonthlyVariationStrip({ panel }: { panel: HTMLElement }) {
  const signatureRef = useRef("");
  const [mode, setMode] = useState<SeriesMode>("both");
  const [points, setPoints] = useState<VariationPoint[]>([]);

  useEffect(() => {
    const update = () => {
      const nextMode = (panel.dataset.seriesMode as SeriesMode | undefined) ?? "both";
      const nextPoints = readVariations(panel);
      const signature = JSON.stringify([nextMode, nextPoints]);

      if (signature === signatureRef.current) return;
      signatureRef.current = signature;
      setMode(nextMode);
      setPoints(nextPoints);
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(panel, {
      attributes: true,
      attributeFilter: ["data-series-mode"],
      childList: true,
      subtree: true,
    });
    const timer = window.setInterval(update, 600);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [panel]);

  const visiblePoints = points.filter((point) => {
    if (mode === "emitted") return point.emitted !== null;
    if (mode === "received") return point.received !== null;
    return point.emitted !== null || point.received !== null;
  });

  if (!visiblePoints.length) return null;

  return (
    <section className="monthly-variation-strip" aria-label="Variação mensal">
      <div className="monthly-variation-heading">
        <strong>Variação mês a mês</strong>
        <span>Comparação com o mês anterior</span>
      </div>
      <div className="monthly-variation-grid">
        {visiblePoints.map((point) => (
          <div className="monthly-variation-item" key={point.month}>
            <strong>{point.month}</strong>
            <div>
              {(mode === "both" || mode === "emitted") && point.emitted !== null && (
                <span className={`monthly-variation-value ${variationTone(point.emitted)} emitted`} title="Variação do emitido">
                  {mode === "both" && <b>E</b>}{formatVariation(point.emitted)}
                </span>
              )}
              {(mode === "both" || mode === "received") && point.received !== null && (
                <span className={`monthly-variation-value ${variationTone(point.received)} received`} title="Variação do recebido">
                  {mode === "both" && <b>R</b>}{formatVariation(point.received)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function MonthlyVariationEnhancer() {
  const [chartPanel, setChartPanel] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => {
      hideDifferenceCard();
      const nextPanel = findChartPanel();
      setChartPanel((current) => current === nextPanel ? current : nextPanel);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style jsx global>{`
        .kpi-difference-hidden {
          display: none !important;
        }

        @media (min-width: 1001px) {
          .kpi-grid.kpi-grid-without-difference {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
        }

        @media (min-width: 641px) and (max-width: 1000px) {
          .kpi-grid.kpi-grid-without-difference {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 640px) {
          .kpi-grid.kpi-grid-without-difference {
            grid-template-columns: 1fr !important;
          }
        }

        .monthly-variation-strip {
          margin-top: 9px;
          padding-top: 12px;
          border-top: 1px solid #eef0f5;
        }

        .monthly-variation-heading {
          margin-bottom: 9px;
          display: flex;
          align-items: baseline;
          gap: 8px;
        }

        .monthly-variation-heading strong {
          color: #444c60;
          font-size: 10px;
        }

        .monthly-variation-heading span {
          color: #a0a7b6;
          font-size: 9px;
        }

        .monthly-variation-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));
          gap: 7px;
        }

        .monthly-variation-item {
          min-width: 0;
          padding: 7px 8px;
          border: 1px solid #edf0f5;
          border-radius: 8px;
          background: #fafbfe;
          text-align: center;
        }

        .monthly-variation-item > strong {
          display: block;
          margin-bottom: 5px;
          color: #697286;
          font-size: 9px;
          text-transform: uppercase;
        }

        .monthly-variation-item > div {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 4px;
        }

        .monthly-variation-value {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 3px 5px;
          border-radius: 5px;
          font-size: 9px;
          font-weight: 850;
          white-space: nowrap;
        }

        .monthly-variation-value b {
          width: 12px;
          height: 12px;
          display: inline-grid;
          place-items: center;
          border-radius: 4px;
          color: #fff;
          font-size: 7px;
        }

        .monthly-variation-value.emitted b { background: #5d72f6; }
        .monthly-variation-value.received b { background: #22b997; }
        .monthly-variation-value.positive { color: #167d67; background: #e8f8f3; }
        .monthly-variation-value.negative { color: #bd4055; background: #fff0f3; }
        .monthly-variation-value.neutral { color: #6f788b; background: #eef1f6; }

        @media print {
          .monthly-variation-strip {
            break-inside: avoid;
          }
        }
      `}</style>
      {chartPanel ? createPortal(<MonthlyVariationStrip panel={chartPanel} />, chartPanel) : null}
    </>
  );
}
