"use client";

import { useEffect } from "react";
import { setReceiptClientAliasLinks } from "@/lib/analytics";
import { normalizeReceiptClientIdentities } from "@/lib/receiptClientIdentity";
import {
  listReceiptClientLinks,
  RECEIPT_CLIENT_LINKS_EVENT,
} from "@/lib/receiptClientLinks";
import {
  ANALYSIS_DATA_EVENT,
  loadAnalysisState,
} from "@/lib/offlineStorage";
import type { ImportState } from "@/lib/types";

function refreshCurrentClientFilter() {
  const select = document.querySelector<HTMLSelectElement>(".client-filter select");
  if (!select?.value) return;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function ReceiptClientIdentityRefresh() {
  useEffect(() => {
    let active = true;
    let frame: number | null = null;

    const refresh = async () => {
      try {
        const [links, stored] = await Promise.all([
          listReceiptClientLinks(),
          loadAnalysisState(),
        ]);

        if (!active) return;

        setReceiptClientAliasLinks(links);
        if (!stored) {
          refreshCurrentClientFilter();
          return;
        }

        const result = normalizeReceiptClientIdentities(stored, links);

        if (frame !== null) window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          frame = null;
          if (!active) return;
          window.dispatchEvent(new CustomEvent<ImportState>(ANALYSIS_DATA_EVENT, {
            detail: result.data,
          }));
          refreshCurrentClientFilter();
        });
      } catch {
        // O dashboard continua usando a base importada mesmo se o vínculo não puder ser recarregado.
      }
    };

    void refresh();
    const onLinksChanged = () => { void refresh(); };
    window.addEventListener(RECEIPT_CLIENT_LINKS_EVENT, onLinksChanged);

    return () => {
      active = false;
      window.removeEventListener(RECEIPT_CLIENT_LINKS_EVENT, onLinksChanged);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
