"use client";

const DB_NAME = "financial-analytics-offline";
const DB_VERSION = 1;
const STORE_NAME = "records";

type StoredImportedFile = {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
};

type OfflineRecord<T> = {
  key: string;
  value: T;
  savedAt: number;
  expiresAt: number;
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao ler a planilha armazenada."));
  });
}

export async function loadForecastReceiptFile() {
  if (typeof window === "undefined" || !("indexedDB" in window)) return null;
  const request = window.indexedDB.open(DB_NAME, DB_VERSION);
  const database = await requestResult(request);
  if (!database.objectStoreNames.contains(STORE_NAME)) {
    database.close();
    return null;
  }
  const transaction = database.transaction(STORE_NAME, "readonly");
  const record = await requestResult(
    transaction.objectStore(STORE_NAME).get("file:receipts") as IDBRequest<OfflineRecord<StoredImportedFile> | undefined>,
  );
  database.close();
  if (!record || record.expiresAt <= Date.now() || !record.value?.blob) return null;
  return new File([record.value.blob], record.value.name, {
    type: record.value.type,
    lastModified: record.value.lastModified,
  });
}
