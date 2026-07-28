"use client";

import { useLayoutEffect } from "react";

const MAIN_STORAGE_KEY = "financial-analytics-data-v1";
const LEGACY_STORAGE_KEY = "financial-analytics-director-workbook-v1";

type StoredData = {
  invoiceFileName?: string;
};

type LegacySnapshot = {
  fileName?: string;
};

export default function LegacyDirectorModeCleanup() {
  useLayoutEffect(() => {
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return;

    try {
      const legacy = JSON.parse(legacyRaw) as LegacySnapshot;
      const mainRaw = window.localStorage.getItem(MAIN_STORAGE_KEY);
      const main = mainRaw ? JSON.parse(mainRaw) as StoredData : null;

      if (legacy.fileName && main?.invoiceFileName === legacy.fileName) {
        window.localStorage.removeItem(MAIN_STORAGE_KEY);
      }
    } catch {
      // Remove apenas o estado legado inválido; as bases normais permanecem intactas.
    } finally {
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  }, []);

  return null;
}
