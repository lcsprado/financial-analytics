"use client";

import { useEffect } from "react";
import { listForecastAdjustments } from "@/lib/forecastManualAdjustments";

function selectedForecastMonth() {
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>(".forecast-filter-v13 select"));
  return selects[1]?.value ?? "";
}

export default function ForecastAdjustmentAuthorEnhancer() {
  useEffect(() => {
    let active = true;
    let frame: number | null = null;
    let lastSignature = "";
    let requestVersion = 0;

    const apply = async () => {
      frame = null;
      const list = document.querySelector<HTMLElement>(".adjustments-list-v13");
      if (!list) {
        lastSignature = "";
        return;
      }

      const articles = Array.from(list.querySelectorAll<HTMLElement>("article"));
      if (!articles.length) return;
      const monthKey = selectedForecastMonth();
      if (!monthKey) return;

      const signature = `${monthKey}|${articles.length}|${articles.map((article) => article.textContent?.trim() ?? "").join("|")}`;
      if (signature === lastSignature && articles.every((article) => article.querySelector("[data-forecast-adjustment-author]"))) return;
      lastSignature = signature;

      const version = ++requestVersion;
      try {
        const adjustments = await listForecastAdjustments(monthKey);
        if (!active || version !== requestVersion) return;

        articles.forEach((article, index) => {
          const adjustment = adjustments[index];
          if (!adjustment) return;
          const content = article.querySelector<HTMLElement>("div:first-child");
          if (!content) return;

          let author = content.querySelector<HTMLElement>("[data-forecast-adjustment-author]");
          if (!author) {
            author = document.createElement("small");
            author.dataset.forecastAdjustmentAuthor = "true";
            author.className = "forecast-adjustment-author";
            content.appendChild(author);
          }

          const who = adjustment.created_by_name?.trim() || "Usuário não registrado";
          const when = adjustment.created_at
            ? new Date(adjustment.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
            : "";
          author.textContent = when ? `Ajustado por: ${who} · ${when}` : `Ajustado por: ${who}`;
        });
      } catch {
        // O painel principal continua disponível mesmo se a autoria não puder ser carregada.
      }
    };

    const schedule = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => { void apply(); });
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", schedule, true);

    return () => {
      active = false;
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <style jsx global>{`
    .forecast-adjustment-author {
      display: block;
      margin-top: 2px;
      color: #68738a !important;
      font-size: 9px !important;
      font-weight: 700;
    }
  `}</style>;
}
