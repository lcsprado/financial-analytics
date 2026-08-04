"use client";

import { useEffect } from "react";
import { normalizeInvoiceClientsByCode } from "@/lib/invoiceClients";
import {
  ANALYSIS_DATA_EVENT,
  loadAnalysisState,
} from "@/lib/offlineStorage";
import type { ImportState } from "@/lib/types";

function normalizedState(data: ImportState) {
  const invoices = normalizeInvoiceClientsByCode(data.invoices ?? []);
  const changed = invoices.some((invoice, index) =>
    invoice !== data.invoices[index]
    || invoice.clientName !== data.invoices[index]?.clientName,
  );

  return changed ? { ...data, invoices } : null;
}

function dispatchNormalized(data: ImportState) {
  const normalized = normalizedState(data);
  if (!normalized) return;

  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent<ImportState>(ANALYSIS_DATA_EVENT, {
      detail: normalized,
    }));
  }, 0);
}

export default function InvoiceClientCodeNormalizer() {
  useEffect(() => {
    let active = true;

    void loadAnalysisState().then((stored) => {
      if (active && stored) dispatchNormalized(stored);
    });

    const handleData = (event: Event) => {
      const data = (event as CustomEvent<ImportState>).detail;
      if (data?.invoices) dispatchNormalized(data);
    };

    window.addEventListener(ANALYSIS_DATA_EVENT, handleData);
    return () => {
      active = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, handleData);
    };
  }, []);

  return null;
}
