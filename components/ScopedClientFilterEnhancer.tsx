"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { canonicalClientName, clientKey } from "@/lib/clientNames";
import type { ImportState } from "@/lib/types";

const STORAGE_KEY = "financial-analytics-data-v1";

type Scope = "overview" | "invoices" | "receipts" | "clients";
type ClientOption = { label: string; value: string };

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function readData(raw: string | null): ImportState {
  try {
    return raw ? JSON.parse(raw) as ImportState : { invoices: [], receipts: [] };
  } catch {
    return { invoices: [], receipts: [] };
  }
}

function readScope(): Scope {
  const title = normalize(document.querySelector<HTMLElement>(".topbar-title h1")?.textContent ?? "");
  if (title === "EMISSOES") return "invoices";
  if (title === "RECEBIMENTOS") return "receipts";
  if (title === "CLIENTES") return "clients";
  return "overview";
}

function sourceNames(data: ImportState, scope: Scope) {
  const invoiceNames = data.invoices.map((item) => item.clientName);
  const receiptNames = data.receipts.map((item) => item.clientHint || item.description);
  if (scope === "invoices") return invoiceNames;
  if (scope === "receipts") return receiptNames;
  return [...invoiceNames, ...receiptNames];
}

function buildOptions(data: ImportState, scope: Scope): ClientOption[] {
  const grouped = new Map<string, ClientOption>();
  sourceNames(data, scope).forEach((rawName) => {
    const label = canonicalClientName(rawName);
    const key = clientKey(label);
    if (!label || !key || grouped.has(key)) return;
    grouped.set(key, { label, value: label });
  });
  return [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function setNativeSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function ensureNativeOption(select: HTMLSelectElement, option: ClientOption) {
  const existing = Array.from(select.options).find((item) => clientKey(item.value) === clientKey(option.value));
  if (existing) return existing.value;
  const native = document.createElement("option");
  native.value = option.value;
  native.textContent = option.label;
  native.dataset.scopedClient = "true";
  select.appendChild(native);
  return native.value;
}

function ScopedControl({ select, options }: { select: HTMLSelectElement; options: ClientOption[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedValue, setSelectedValue] = useState(select.value);
  const [text, setText] = useState(() => select.value ? canonicalClientName(select.value) : "");
  const listId = `scoped-client-filter-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const sync = () => {
      setSelectedValue(select.value);
      if (document.activeElement !== inputRef.current) {
        setText(select.value ? canonicalClientName(select.value) : "");
      }
    };
    select.addEventListener("change", sync);
    sync();
    return () => select.removeEventListener("change", sync);
  }, [select]);

  const selectedKey = clientKey(selectedValue);
  const selectedIndex = options.findIndex((option) => clientKey(option.value) === selectedKey);
  const position = selectedIndex >= 0 ? `${selectedIndex + 1}/${options.length}` : `${options.length}`;

  function choose(option: ClientOption) {
    const value = ensureNativeOption(select, option);
    setText(option.label);
    setNativeSelect(select, value);
    inputRef.current?.blur();
  }

  function onTextChange(value: string) {
    setText(value);
    if (!value.trim()) {
      if (select.value) setNativeSelect(select, "");
      return;
    }
    const normalized = normalize(value);
    const exact = options.find((option) => normalize(option.label) === normalized);
    if (exact) choose(exact);
    else if (select.value) setNativeSelect(select, "");
  }

  function navigate(direction: -1 | 1) {
    if (!options.length) return;
    const index = selectedIndex < 0
      ? (direction > 0 ? 0 : options.length - 1)
      : (selectedIndex + direction + options.length) % options.length;
    choose(options[index]);
  }

  return (
    <div className="scoped-client-navigation">
      <div className="scoped-client-search">
        <input
          ref={inputRef}
          type="search"
          list={listId}
          value={text}
          placeholder="Todos os clientes"
          aria-label="Buscar cliente"
          autoComplete="off"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => onTextChange(event.target.value)}
          onBlur={() => window.setTimeout(() => setText(select.value ? canonicalClientName(select.value) : ""), 100)}
        />
        <datalist id={listId}>
          {options.map((option) => <option key={clientKey(option.label)} value={option.label} />)}
        </datalist>
        {(text || select.value) && (
          <button type="button" className="scoped-client-clear" aria-label="Limpar cliente" onMouseDown={(event) => event.preventDefault()} onClick={() => {
            setText("");
            setNativeSelect(select, "");
            inputRef.current?.focus();
          }}>×</button>
        )}
        <span className="scoped-client-position">{position}</span>
      </div>
      <div className="scoped-client-arrows">
        <button type="button" aria-label="Cliente anterior" onClick={() => navigate(-1)} disabled={!options.length}><ChevronUp size={14} /></button>
        <button type="button" aria-label="Próximo cliente" onClick={() => navigate(1)} disabled={!options.length}><ChevronDown size={14} /></button>
      </div>
    </div>
  );
}

export default function ScopedClientFilterEnhancer() {
  const [select, setSelect] = useState<HTMLSelectElement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<ImportState>({ invoices: [], receipts: [] });
  const [scope, setScope] = useState<Scope>("overview");
  const signatureRef = useRef("");

  useEffect(() => {
    const sync = () => {
      const nextSelect = document.querySelector<HTMLSelectElement>(".client-filter select");
      const nextTarget = nextSelect?.parentElement ?? null;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const nextScope = readScope();
      const signature = `${raw ?? ""}|${nextScope}`;
      setSelect((current) => current === nextSelect ? current : nextSelect);
      setTarget((current) => current === nextTarget ? current : nextTarget);
      setScope((current) => current === nextScope ? current : nextScope);
      if (signature !== signatureRef.current) {
        signatureRef.current = signature;
        setData(readData(raw));
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("storage", sync);
    const timer = window.setInterval(sync, 500);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", sync);
      window.clearInterval(timer);
    };
  }, []);

  const options = useMemo(() => buildOptions(data, scope), [data, scope]);

  useEffect(() => {
    if (!select) return;
    options.forEach((option) => ensureNativeOption(select, option));
    if (select.value && !options.some((option) => clientKey(option.value) === clientKey(select.value))) {
      setNativeSelect(select, "");
    }
  }, [select, options]);

  return (
    <>
      <style jsx global>{`
        .client-filter-navigation { display: none !important; }
        .scoped-client-navigation { width: 275px; display: grid; grid-template-columns: minmax(0, 1fr) 32px; gap: 5px; align-items: stretch; }
        .scoped-client-search { position: relative; min-width: 0; }
        .scoped-client-search input { width: 100%; height: 34px; padding: 0 67px 0 11px; color: #50596c; background: #f8f9fc; border: 1px solid #e6e9f0; border-radius: 8px; outline: none; font-size: 12px; font-weight: 600; }
        .scoped-client-search input:focus { border-color: #9aa8fb; box-shadow: 0 0 0 3px rgba(93,114,246,.12); background: #fff; }
        .scoped-client-search input::-webkit-search-cancel-button { display: none; }
        .scoped-client-clear { position: absolute; right: 34px; top: 50%; transform: translateY(-50%); width: 20px; height: 20px; display: grid; place-items: center; border: 0; background: transparent; color: #7e879b; font-size: 17px; }
        .scoped-client-position { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); min-width: 25px; padding: 3px 4px; border-radius: 5px; color: #7d879b; background: #edf0f6; font-size: 8px; font-weight: 850; line-height: 1; text-align: center; pointer-events: none; }
        .scoped-client-arrows { display: grid; grid-template-rows: repeat(2, 1fr); gap: 2px; }
        .scoped-client-arrows button { min-width: 32px; padding: 0; display: grid; place-items: center; border: 1px solid #e2e6ef; border-radius: 6px; color: #697389; background: #f8f9fc; }
        .scoped-client-arrows button:hover:not(:disabled) { color: #fff; border-color: #5d72f6; background: #5d72f6; }
        @media (max-width: 760px) { .scoped-client-navigation { width: 100%; } }
        @media print { .scoped-client-navigation { display: none !important; } }
      `}</style>
      {target && select ? createPortal(<ScopedControl select={select} options={options} />, target) : null}
    </>
  );
}
