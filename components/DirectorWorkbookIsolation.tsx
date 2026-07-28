"use client";

import { useEffect } from "react";

const DIRECTOR_STORAGE_KEY = "financial-analytics-director-workbook-v1";
const MAIN_STORAGE_KEY = "financial-analytics-data-v1";
const RELOAD_GUARD_KEY = "financial-analytics-director-isolation-reload";

type StoredDirectorSnapshot = {
  fileName?: string;
};

type StoredDashboardData = {
  invoices?: unknown[];
  receipts?: unknown[];
  invoiceFileName?: string;
  receiptFileName?: string;
};

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export default function DirectorWorkbookIsolation() {
  useEffect(() => {
    const isolate = () => {
      const snapshot = readJson<StoredDirectorSnapshot>(DIRECTOR_STORAGE_KEY);
      const data = readJson<StoredDashboardData>(MAIN_STORAGE_KEY);
      if (!snapshot?.fileName || !data?.invoiceFileName) return;
      if (snapshot.fileName !== data.invoiceFileName) return;

      const receipts = Array.isArray(data.receipts) ? data.receipts : [];
      if (!receipts.length) {
        window.sessionStorage.removeItem(RELOAD_GUARD_KEY);
        return;
      }

      data.receipts = [];
      delete data.receiptFileName;
      window.localStorage.setItem(MAIN_STORAGE_KEY, JSON.stringify(data));

      if (window.sessionStorage.getItem(RELOAD_GUARD_KEY) === snapshot.fileName) return;
      window.sessionStorage.setItem(RELOAD_GUARD_KEY, snapshot.fileName);
      window.location.reload();
    };

    isolate();
    const timer = window.setInterval(isolate, 300);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}
