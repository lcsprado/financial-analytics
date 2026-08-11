"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Snapshot = {
  pending: number;
  received: number;
  pendingActive: boolean;
  receivedActive: boolean;
};

function parseCurrency(value: string) {
  const match = value.match(/R\$\s*-?[\d.]+,\d{2}/i);
  if (!match) return 0;
  const parsed = Number(match[0].replace(/R\$/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameSnapshot(left: Snapshot, right: Snapshot) {
  return left.pending === right.pending
    && left.received === right.received
    && left.pendingActive === right.pendingActive
    && left.receivedActive === right.receivedActive;
}

export default function ReceiptForecastKpiSimplifier() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot>({
    pending: 0,
    received: 0,
    pendingActive: true,
    receivedActive: false,
  });
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const read = () => {
      const container = document.querySelector<HTMLElement>(".forecast-kpis-v13");
      if (container && container !== target) setTarget(container);
      if (!container) return;

      const baseCards = [...container.querySelectorAll<HTMLElement>(":scope > article")];
      const pendingCard = baseCards[0];
      const receivedCard = baseCards[1];
      if (!pendingCard || !receivedCard) return;

      const storedBase = Number(pendingCard.dataset.fullWeekBaseValueV25 || "NaN");
      const basePending = Number.isFinite(storedBase)
        ? storedBase
        : parseCurrency(pendingCard.querySelector<HTMLElement>("strong")?.textContent || "");

      const spillover = [...document.querySelectorAll<HTMLTableRowElement>("tr[data-full-week-spillover-v25='true']")]
        .reduce((sum, row) => sum + parseCurrency(row.querySelector<HTMLElement>("td.number strong")?.textContent || ""), 0);

      const next: Snapshot = {
        pending: basePending + spillover,
        received: parseCurrency(receivedCard.querySelector<HTMLElement>("strong")?.textContent || ""),
        pendingActive: pendingCard.classList.contains("active"),
        receivedActive: receivedCard.classList.contains("active"),
      };

      setSnapshot((current) => sameSnapshot(current, next) ? current : next);
    };

    const schedule = () => {
      if (frame.current !== null) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = null;
        read();
      });
    };

    schedule();
    const observerTarget = document.querySelector<HTMLElement>(".content-area") || document.body;
    const observer = new MutationObserver(schedule);
    observer.observe(observerTarget, { childList: true, subtree: true, characterData: true, attributes: true });
    document.addEventListener("change", schedule, true);
    document.addEventListener("click", schedule, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      document.removeEventListener("click", schedule, true);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  }, [target]);

  const clickBaseCard = (index: number) => {
    const container = document.querySelector<HTMLElement>(".forecast-kpis-v13");
    const cards = container ? [...container.querySelectorAll<HTMLElement>(":scope > article")] : [];
    cards[index]?.click();
  };

  return (
    <>
      <style jsx global>{`
        .receipt-forecast-active-v13 .forecast-kpis-v13 {
          grid-template-columns: 1fr !important;
        }

        .receipt-forecast-active-v13 .forecast-kpis-v13 > article {
          display: none !important;
        }

        .receipt-forecast-active-v13 .forecast-kpis-stable-v26 {
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          width: 100%;
        }

        .receipt-forecast-active-v13 .forecast-kpis-stable-v26 article {
          min-width: 0;
          cursor: pointer;
        }

        .receipt-forecast-active-v13 #forecast-accuracy-v14,
        .receipt-forecast-active-v13 .forecast-accuracy-v14 {
          display: none !important;
        }

        @media (max-width: 760px) {
          .receipt-forecast-active-v13 .forecast-kpis-stable-v26 {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {target ? createPortal(
        <div className="forecast-kpis-stable-v26">
          <article className={snapshot.pendingActive ? "active" : ""} onClick={() => clickBaseCard(0)}>
            <span>A receber no período</span>
            <strong>{BRL.format(snapshot.pending)}</strong>
            <small>Previsão consolidada do período selecionado</small>
          </article>
          <article className={snapshot.receivedActive ? "active" : ""} onClick={() => clickBaseCard(1)}>
            <span>Recebido no período</span>
            <strong>{BRL.format(snapshot.received)}</strong>
            <small>Recebimentos reais do período selecionado</small>
          </article>
        </div>,
        target,
      ) : null}
    </>
  );
}
