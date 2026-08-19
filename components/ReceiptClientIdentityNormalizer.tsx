"use client";

import { useEffect, useRef, useState } from "react";
import { setReceiptClientAliasLinks } from "@/lib/analytics";
import {
  normalizeReceiptClientIdentities,
  type ReceiptIdentityStats,
} from "@/lib/receiptClientIdentity";
import {
  listReceiptClientLinks,
  RECEIPT_CLIENT_LINKS_EVENT,
  type ReceiptClientLink,
} from "@/lib/receiptClientLinks";
import {
  ANALYSIS_DATA_EVENT,
  loadAnalysisState,
  OFFLINE_DATA_CLEARED_EVENT,
} from "@/lib/offlineStorage";
import type { ImportState } from "@/lib/types";

const EMPTY_STATS: ReceiptIdentityStats = {
  changedReceipts: 0,
  aliasGroups: 0,
  exactMasterMatches: 0,
  fuzzyMasterMatches: 0,
  ambiguousMatches: 0,
  manualMatches: 0,
};

function sameStats(left: ReceiptIdentityStats, right: ReceiptIdentityStats) {
  return left.changedReceipts === right.changedReceipts
    && left.aliasGroups === right.aliasGroups
    && left.exactMasterMatches === right.exactMasterMatches
    && left.fuzzyMasterMatches === right.fuzzyMasterMatches
    && left.ambiguousMatches === right.ambiguousMatches
    && left.manualMatches === right.manualMatches;
}

export default function ReceiptClientIdentityNormalizer() {
  const [stats, setStats] = useState<ReceiptIdentityStats>(EMPTY_STATS);
  const dispatching = useRef(false);
  const latestStats = useRef<ReceiptIdentityStats>(EMPTY_STATS);
  const linksRef = useRef<ReceiptClientLink[]>([]);
  const dataRef = useRef<ImportState | null>(null);

  useEffect(() => {
    let active = true;

    const process = (data: ImportState) => {
      if (!data?.receipts) return;
      dataRef.current = data;
      const result = normalizeReceiptClientIdentities(data, linksRef.current);
      if (!sameStats(latestStats.current, result.stats)) {
        latestStats.current = result.stats;
        setStats(result.stats);
      }

      if (!result.changed || dispatching.current) return;
      dispatching.current = true;
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent<ImportState>(ANALYSIS_DATA_EVENT, {
          detail: result.data,
        }));
        window.setTimeout(() => { dispatching.current = false; }, 0);
      }, 0);
    };

    const reloadLinks = async () => {
      try {
        const links = await listReceiptClientLinks();
        linksRef.current = links;
        setReceiptClientAliasLinks(links);
        if (dataRef.current) process(dataRef.current);
      } catch {
        linksRef.current = [];
        setReceiptClientAliasLinks([]);
      }
    };

    void (async () => {
      await reloadLinks();
      const stored = await loadAnalysisState();
      if (active && stored) process(stored);
    })();

    const onData = (event: Event) => {
      const detail = (event as CustomEvent<ImportState>).detail;
      if (detail) process(detail);
    };
    const onLinks = () => { void reloadLinks(); };
    const onClear = () => {
      dataRef.current = null;
      latestStats.current = EMPTY_STATS;
      setReceiptClientAliasLinks([]);
      setStats(EMPTY_STATS);
    };

    window.addEventListener(ANALYSIS_DATA_EVENT, onData);
    window.addEventListener(RECEIPT_CLIENT_LINKS_EVENT, onLinks);
    window.addEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    return () => {
      active = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, onData);
      window.removeEventListener(RECEIPT_CLIENT_LINKS_EVENT, onLinks);
      window.removeEventListener(OFFLINE_DATA_CLEARED_EVENT, onClear);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      if (!document.body.classList.contains("receipt-forecast-active-v13")) return;
      const panels = [...document.querySelectorAll<HTMLElement>(".forecast-panel-v13")];
      const panel = panels.find((item) => {
        const title = item.querySelector(".forecast-panel-head-v13 h3")?.textContent?.trim() || "";
        return title === "Clientes do período" || title === "Clientes consolidados";
      });
      if (!panel) return;

      const head = panel.querySelector<HTMLElement>(".forecast-panel-head-v13 > div");
      const title = head?.querySelector<HTMLElement>("h3");
      const subtitle = head?.querySelector<HTMLElement>("p");
      if (title && title.textContent !== "Clientes consolidados") title.textContent = "Clientes consolidados";

      const rowCount = panel.querySelectorAll(".forecast-table-v13 tbody tr:not([style*='display: none'])").length;
      const currentStats = latestStats.current;
      const manualText = currentStats.manualMatches ? ` · ${currentStats.manualMatches} recebimentos por vínculo manual` : "";
      const subtitleText = `${rowCount} registros · vínculos manuais${manualText}`;
      if (subtitle && subtitle.textContent !== subtitleText) subtitle.textContent = subtitleText;

      if (head && !head.querySelector(".client-identity-v16-badge")) {
        const badge = document.createElement("span");
        badge.className = "client-identity-v16-badge";
        badge.textContent = "VÍNCULOS MANUAIS";
        badge.title = "O sistema não tenta mais adivinhar clientes semelhantes. Os vínculos cadastrados por você têm prioridade.";
        head.appendChild(badge);
      }
    };

    const scheduleSync = () => window.setTimeout(sync, 0);
    sync();
    document.addEventListener("click", scheduleSync, true);
    window.addEventListener(ANALYSIS_DATA_EVENT, scheduleSync);

    return () => {
      document.removeEventListener("click", scheduleSync, true);
      window.removeEventListener(ANALYSIS_DATA_EVENT, scheduleSync);
    };
  }, [stats]);

  return (
    <style jsx global>{`
      .receipt-forecast-active-v13 .client-identity-v16-badge {
        display: inline-flex;
        width: fit-content;
        align-items: center;
        min-height: 20px;
        margin-top: 7px;
        padding: 0 7px;
        border: 1px solid #dde3ff;
        border-radius: 999px;
        background: #f2f4ff;
        color: #5367df;
        font-size: 7.5px;
        font-weight: 900;
        letter-spacing: .065em;
      }
    `}</style>
  );
}
