"use client";

import { Flag } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function markReceivedRows() {
  document.querySelectorAll<HTMLTableRowElement>(".forecast-table-v13 tbody tr").forEach((row) => {
    const title = normalize(row.querySelector<HTMLElement>("td:nth-child(4) .status b")?.textContent || "");
    row.dataset.onlyPendingReceived = title.startsWith("RECEBIDO") ? "true" : "false";
  });
}

export default function ReceiptForecastOnlyPendingToggle() {
  const [onlyPending, setOnlyPending] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const sync = () => {
      setTarget(document.querySelector<HTMLElement>(".forecast-filter-v13"));
      markReceivedRows();
    };

    const schedule = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = null;
        sync();
      }, 70);
    };

    sync();
    document.addEventListener("click", schedule, true);
    document.addEventListener("change", schedule, true);

    return () => {
      document.removeEventListener("click", schedule, true);
      document.removeEventListener("change", schedule, true);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("forecast-only-pending-v16", onlyPending);
    markReceivedRows();
    return () => document.body.classList.remove("forecast-only-pending-v16");
  }, [onlyPending]);

  const button = (
    <button
      type="button"
      className={`forecast-only-pending-button-v16${onlyPending ? " active" : ""}`}
      aria-pressed={onlyPending}
      title="Ocultar clientes já recebidos e mostrar somente o saldo ainda previsto"
      onClick={() => setOnlyPending((value) => !value)}
    >
      <Flag size={15} />
      <span>Somente a receber</span>
    </button>
  );

  return (
    <>
      {target ? createPortal(button, target) : null}
      <style jsx global>{`
        .receipt-forecast-active-v13 .forecast-only-pending-button-v16 {
          align-self: end;
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 42px;
          padding: 0 13px;
          border: 1px solid #d5dbe8;
          border-radius: 10px;
          background: #fff;
          color: #59647a;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
          cursor: pointer;
          transition: border-color .16s ease, background .16s ease, color .16s ease, box-shadow .16s ease;
        }

        .receipt-forecast-active-v13 .forecast-only-pending-button-v16:hover {
          border-color: #aeb8d2;
          color: #3f4d69;
        }

        .receipt-forecast-active-v13 .forecast-only-pending-button-v16.active {
          border-color: rgba(93,114,246,.52);
          background: #eef1ff;
          color: #5367df;
          box-shadow: inset 0 0 0 1px rgba(93,114,246,.06);
        }

        .receipt-forecast-active-v13.forecast-only-pending-v16 .forecast-table-v13 tbody tr[data-only-pending-received="true"] {
          display: none !important;
        }

        @media (max-width: 760px) {
          .receipt-forecast-active-v13 .forecast-only-pending-button-v16 {
            width: 100%;
          }
        }

        @media print {
          .forecast-only-pending-button-v16 {
            display: none !important;
          }

          .receipt-forecast-active-v13 .forecast-table-v13 tbody tr[data-only-pending-received="true"] {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
