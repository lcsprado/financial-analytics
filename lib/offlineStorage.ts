"use client";

import type { ImportState, PeriodFilter } from "@/lib/types";

export const STORAGE_CONSENT_KEY = "financial-analytics-storage-consent-v1";
export const STORAGE_CONSENT_EVENT = "financial-analytics-storage-consent-changed";
export const ANALYSIS_DATA_EVENT = "financial-analytics-analysis-data-updated";
export const CHANNEL_DATA_EVENT = "financial-analytics-receipt-channels-updated";
export const OFFLINE_DATA_CLEARED_EVENT = "financial-analytics-offline-data-cleared";
export const FILTER_STORAGE_KEY = "financial-analytics-filters-v1";
export const INCLUDE_CHANNEL_STORAGE_KEY = "financial-analytics-include-receipt-channels-v1";

const LEGACY_ANALYSIS_KEY = "financial-analytics-data-v1";
const LEGACY_CHANNEL_KEY = "financial-analytics-receipt-channels-v1";
const DB_NAME = "financial-analytics-offline";
const DB_VERSION = 1;
const STORE_NAME = "records";
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type OfflineRecord<T> = {
  key: string;
  value: T;
  savedAt: number;
  expiresAt: number;
};

export type StoredImportedFile = {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
};

const ANALYSIS_KEY = "analysis";
const CHANNEL_KEY = "receipt-channels";

let runtimeChannelPayload: unknown | null = null;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no armazenamento local."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Falha no armazenamento local."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Operação de armazenamento cancelada."));
  });
}

async function openDatabase() {
  if (!("indexedDB" in window)) {
    throw new Error("Este navegador não oferece armazenamento offline compatível.");
  }
  const request = window.indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
    }
  };
  return requestResult(request);
}

async function putRecord<T>(key: string, value: T) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put({
    key,
    value,
    savedAt: Date.now(),
    expiresAt: Date.now() + RETENTION_MS,
  } satisfies OfflineRecord<T>);
  await transactionDone(transaction);
  database.close();
}

async function getRecord<T>(key: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const record = await requestResult(
    transaction.objectStore(STORE_NAME).get(key) as IDBRequest<OfflineRecord<T> | undefined>,
  );
  await transactionDone(transaction);
  database.close();
  if (!record) return null;
  if (record.expiresAt <= Date.now()) {
    await deleteRecord(key);
    return null;
  }
  return record.value;
}

async function deleteRecord(key: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(key);
  await transactionDone(transaction);
  database.close();
}

export function hasStorageConsent() {
  return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_CONSENT_KEY) === "true";
}

export function setStorageConsent(consented: boolean) {
  window.localStorage.setItem(STORAGE_CONSENT_KEY, String(consented));
  window.dispatchEvent(new CustomEvent(STORAGE_CONSENT_EVENT, { detail: { consented } }));
}

async function migrateLegacyStorage() {
  const analysisRaw = window.localStorage.getItem(LEGACY_ANALYSIS_KEY);
  const channelRaw = window.localStorage.getItem(LEGACY_CHANNEL_KEY);
  if (!analysisRaw && !channelRaw) return;

  if (window.localStorage.getItem(STORAGE_CONSENT_KEY) === null) {
    setStorageConsent(true);
  }
  if (!hasStorageConsent()) return;

  try {
    if (analysisRaw) await putRecord(ANALYSIS_KEY, JSON.parse(analysisRaw) as ImportState);
    if (channelRaw) {
      const legacyPayload = JSON.parse(channelRaw);
      runtimeChannelPayload = legacyPayload;
      await putRecord(CHANNEL_KEY, legacyPayload);
    }
    window.localStorage.removeItem(LEGACY_ANALYSIS_KEY);
    window.localStorage.removeItem(LEGACY_CHANNEL_KEY);
  } catch {
    // Mantém os dados legados intactos se a migração não puder ser concluída.
  }
}

export async function loadAnalysisState() {
  await migrateLegacyStorage();
  if (!hasStorageConsent()) return null;
  return getRecord<ImportState>(ANALYSIS_KEY);
}

export async function saveAnalysisState(data: ImportState) {
  if (!hasStorageConsent()) return;
  await putRecord(ANALYSIS_KEY, data);
}

export async function loadChannelPayload<T>() {
  await migrateLegacyStorage();
  if (runtimeChannelPayload !== null) return runtimeChannelPayload as T;
  if (!hasStorageConsent()) return null;
  const stored = await getRecord<T>(CHANNEL_KEY);
  runtimeChannelPayload = stored;
  return stored;
}

export async function saveChannelPayload<T>(payload: T) {
  runtimeChannelPayload = payload;
  if (!hasStorageConsent()) return;
  await putRecord(CHANNEL_KEY, payload);
}

export async function saveImportedFile(kind: "invoices" | "receipts", file: File) {
  if (!hasStorageConsent()) return;
  await putRecord<StoredImportedFile>(`file:${kind}`, {
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    blob: file,
  });
}

export function readStoredFilter(): PeriodFilter {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FILTER_STORAGE_KEY) ?? "") as PeriodFilter;
    const year = parsed.year === "all" || Number.isFinite(parsed.year) ? parsed.year : 2026;
    const month = parsed.month === "all" || Number.isFinite(parsed.month) ? parsed.month : "all";
    return { year, month, client: typeof parsed.client === "string" ? parsed.client : "" };
  } catch {
    return { year: 2026, month: "all", client: "" };
  }
}

export function saveStoredFilter(filter: PeriodFilter) {
  window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filter));
}

export function notifyAnalysisData(data: ImportState) {
  window.dispatchEvent(new CustomEvent<ImportState>(ANALYSIS_DATA_EVENT, { detail: data }));
}

export async function clearOfflineData() {
  runtimeChannelPayload = null;
  if ("indexedDB" in window) {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
    database.close();
  }
  window.localStorage.removeItem(LEGACY_ANALYSIS_KEY);
  window.localStorage.removeItem(LEGACY_CHANNEL_KEY);
  window.dispatchEvent(new Event(OFFLINE_DATA_CLEARED_EVENT));
}
