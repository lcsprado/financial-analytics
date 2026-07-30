"use client";

import { Check, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { canonicalClientName, clientKey } from "@/lib/clientNames";
import { joinClientSelection, splitClientSelection } from "@/lib/clientSelection";
import { canonicalReceiptClientName, receiptClientKey } from "@/lib/receiptClientNames";
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

function labelForScope(value: string, scope: Scope) {
  return scope === "receipts"
    ? canonicalReceiptClientName(value)
    : canonicalClientName(value);
}

function keyForScope(value: string, scope: Scope) {
  return scope === "receipts"
    ? receiptClientKey(value)
    : clientKey(value);
}

function buildOptions(data: ImportState, scope: Scope): ClientOption[] {
  const grouped = new Map<string, ClientOption>();
  sourceNames(data, scope).forEach((rawName) => {
    const label = labelForScope(rawName, scope);
    const key = keyForScope(label, scope);
    if (!label || !key || grouped.has(key)) return;
    grouped.set(key, { label, value: label });
  });
  return [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function setNativeSelect(select: HTMLSelectElement, value: string, dispatch = true) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  if (dispatch) select.dispatchEvent(new Event("change", { bubbles: true }));
}

function ensureNativeOption(select: HTMLSelectElement, option: ClientOption, scope: Scope) {
  const optionKey = keyForScope(option.value, scope);
  const existing = Array.from(select.options).find((item) =>
    item.dataset.multiClient !== "true" && keyForScope(item.value, scope) === optionKey,
  );
  if (existing) return existing.value;

  const native = document.createElement("option");
  native.value = option.value;
  native.textContent = option.label;
  native.dataset.scopedClient = "true";
  select.appendChild(native);
  return native.value;
}

function selectionSummary(selected: string[], scope: Scope) {
  if (!selected.length) return "Todos os clientes";
  if (selected.length === 1) return labelForScope(selected[0], scope);
  return `${selected.length} clientes selecionados`;
}

function ensureSelectionValue(
  select: HTMLSelectElement,
  selected: string[],
  options: ClientOption[],
  scope: Scope,
) {
  const encoded = joinClientSelection(selected);

  Array.from(select.options)
    .filter((option) => option.dataset.multiClient === "true" && option.value !== encoded)
    .forEach((option) => option.remove());

  if (!selected.length) return "";

  if (selected.length === 1) {
    const key = keyForScope(selected[0], scope);
    const option = options.find((item) => keyForScope(item.value, scope) === key)
      ?? { label: labelForScope(selected[0], scope), value: selected[0] };
    return ensureNativeOption(select, option, scope);
  }

  let native = Array.from(select.options).find((option) => option.value === encoded);
  if (!native) {
    native = document.createElement("option");
    native.value = encoded;
    native.dataset.multiClient = "true";
    select.appendChild(native);
  }
  native.textContent = selectionSummary(selected, scope);
  return native.value;
}

function MultiClientControl({
  select,
  options,
  scope,
}: {
  select: HTMLSelectElement;
  options: ClientOption[];
  scope: Scope;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(() => splitClientSelection(select.value));

  useEffect(() => {
    const sync = () => {
      const next = splitClientSelection(select.value);
      const nextSignature = joinClientSelection(next);
      setSelected((current) => joinClientSelection(current) === nextSignature ? current : next);
    };
    select.addEventListener("change", sync);
    sync();
    return () => select.removeEventListener("change", sync);
  }, [select]);

  useEffect(() => {
    const nativeValue = ensureSelectionValue(select, selected, options, scope);
    if (select.value !== nativeValue) setNativeSelect(select, nativeValue, false);
  }, [select, selected, options, scope]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();

    const closeOnOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const selectedKeys = useMemo(
    () => new Set(selected.map((value) => keyForScope(value, scope)).filter(Boolean)),
    [selected, scope],
  );

  const visibleOptions = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return options;
    return options.filter((option) => normalize(option.label).includes(normalizedQuery));
  }, [options, query]);

  function applySelection(next: string[]) {
    const pageScroll = { x: window.scrollX, y: window.scrollY };
    const listScrollTop = listRef.current?.scrollTop ?? 0;
    const unique = [...new Map(next.map((value) => [keyForScope(value, scope), value])).values()]
      .filter(Boolean);
    const nativeValue = ensureSelectionValue(select, unique, options, scope);
    setSelected(unique);
    setNativeSelect(select, nativeValue);

    requestAnimationFrame(() => {
      window.scrollTo(pageScroll.x, pageScroll.y);
      if (listRef.current) listRef.current.scrollTop = listScrollTop;
    });
  }

  function toggle(option: ClientOption) {
    const key = keyForScope(option.value, scope);
    const exists = selectedKeys.has(key);
    const next = exists
      ? selected.filter((value) => keyForScope(value, scope) !== key)
      : [...selected, option.value];
    applySelection(next);
  }

  function navigateClient(direction: -1 | 1) {
    if (!options.length) return;

    const anchor = selected[selected.length - 1] ?? "";
    const currentIndex = anchor
      ? options.findIndex((option) => keyForScope(option.value, scope) === keyForScope(anchor, scope))
      : -1;
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : options.length - 1)
      : (currentIndex + direction + options.length) % options.length;

    applySelection([options[nextIndex].value]);
    setOpen(false);
    setQuery("");
  }

  const summary = selectionSummary(selected, scope);
  const countLabel = selected.length ? `${selected.length}/${options.length}` : `${options.length}`;

  return (
    <div className="multi-client-navigation" ref={rootRef}>
      <div className="multi-client-filter">
        <button
          type="button"
          className={`multi-client-trigger ${open ? "is-open" : ""}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span title={summary}>{summary}</span>
          <em>{countLabel}</em>
          <ChevronDown size={15} />
        </button>

        {open && (
          <div className="multi-client-popover">
            <div className="multi-client-search">
              <Search size={15} />
              <input
                ref={searchRef}
                type="search"
                value={query}
                placeholder="Buscar cliente"
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button type="button" aria-label="Limpar busca" onClick={() => setQuery("")}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="multi-client-toolbar">
              <span>{selected.length ? `${selected.length} selecionado${selected.length > 1 ? "s" : ""}` : "Nenhum selecionado"}</span>
              <button type="button" onClick={() => applySelection([])} disabled={!selected.length}>Limpar seleção</button>
            </div>

            <div ref={listRef} className="multi-client-list" role="listbox" aria-multiselectable="true">
              {visibleOptions.map((option) => {
                const checked = selectedKeys.has(keyForScope(option.value, scope));
                return (
                  <label
                    key={keyForScope(option.value, scope)}
                    className={checked ? "is-selected" : ""}
                    onMouseDown={(event) => event.preventDefault()}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(option)} />
                    <span className="multi-client-checkbox"><Check size={12} /></span>
                    <span title={option.label}>{option.label}</span>
                  </label>
                );
              })}
              {!visibleOptions.length && <p>Nenhum cliente encontrado.</p>}
            </div>
          </div>
        )}
      </div>

      <div className="multi-client-arrows" role="group" aria-label="Navegar entre clientes">
        <button
          type="button"
          aria-label="Cliente anterior"
          title="Cliente anterior"
          disabled={!options.length}
          onClick={() => navigateClient(-1)}
        >
          <ChevronUp size={13} />
        </button>
        <button
          type="button"
          aria-label="Próximo cliente"
          title="Próximo cliente"
          disabled={!options.length}
          onClick={() => navigateClient(1)}
        >
          <ChevronDown size={13} />
        </button>
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
    options.forEach((option) => ensureNativeOption(select, option, scope));

    const current = splitClientSelection(select.value);
    const valid = current.filter((value) =>
      options.some((option) => keyForScope(option.value, scope) === keyForScope(value, scope)),
    );

    if (joinClientSelection(current) !== joinClientSelection(valid)) {
      const nativeValue = ensureSelectionValue(select, valid, options, scope);
      setNativeSelect(select, nativeValue);
    } else {
      const nativeValue = ensureSelectionValue(select, current, options, scope);
      if (select.value !== nativeValue) setNativeSelect(select, nativeValue, false);
    }
  }, [select, options, scope]);

  return (
    <>
      <style jsx global>{`
        .client-filter-navigation { display: none !important; }
        .client-filter .select-wrap { width: 292px !important; overflow: visible !important; }
        .multi-client-navigation {
          width: 292px; display: grid; grid-template-columns: minmax(0, 1fr) 32px;
          gap: 5px; align-items: stretch;
        }
        .multi-client-filter { position: relative; min-width: 0; }
        .multi-client-trigger {
          width: 100%; height: 34px; padding: 0 9px 0 11px; display: grid;
          grid-template-columns: minmax(0, 1fr) auto 16px; gap: 7px; align-items: center;
          color: #50596c; background: #f8f9fc; border: 1px solid #e6e9f0; border-radius: 8px;
          font-size: 12px; font-weight: 650; text-align: left;
        }
        .multi-client-trigger:hover, .multi-client-trigger.is-open {
          border-color: #9aa8fb; background: #fff; box-shadow: 0 0 0 3px rgba(93,114,246,.1);
        }
        .multi-client-trigger > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .multi-client-trigger em {
          min-width: 30px; padding: 3px 5px; border-radius: 5px; color: #727c91;
          background: #edf0f6; font-size: 8px; font-style: normal; font-weight: 850; text-align: center;
        }
        .multi-client-trigger svg { transition: transform .16s ease; }
        .multi-client-trigger.is-open svg { transform: rotate(180deg); }
        .multi-client-arrows {
          height: 34px; display: grid; grid-template-rows: repeat(2, 1fr); gap: 2px;
        }
        .multi-client-arrows button {
          min-width: 32px; padding: 0; display: grid; place-items: center;
          border: 1px solid #e1e5ee; color: #687288; background: linear-gradient(#fff, #f6f8fb);
          box-shadow: 0 1px 2px rgba(35, 45, 70, .06); transition: .16s ease;
        }
        .multi-client-arrows button:first-child { border-radius: 7px 7px 4px 4px; }
        .multi-client-arrows button:last-child { border-radius: 4px 4px 7px 7px; }
        .multi-client-arrows button:hover:not(:disabled) {
          color: #fff; border-color: #5d72f6; background: #5d72f6;
          box-shadow: 0 2px 6px rgba(93, 114, 246, .24);
        }
        .multi-client-arrows button:active:not(:disabled) { transform: translateY(1px); }
        .multi-client-arrows button:disabled { opacity: .38; cursor: not-allowed; }
        .multi-client-popover {
          position: absolute; z-index: 1200; top: calc(100% + 7px); right: 0;
          width: min(410px, calc(100vw - 30px)); padding: 9px;
          border: 1px solid #e1e5ed; border-radius: 11px; background: #fff;
          box-shadow: 0 16px 38px rgba(28,37,61,.17);
        }
        .multi-client-search {
          height: 36px; display: grid; grid-template-columns: 18px minmax(0,1fr) 24px;
          gap: 6px; align-items: center; padding: 0 8px; border: 1px solid #e6e9f0;
          border-radius: 8px; background: #f8f9fc; color: #8992a5;
        }
        .multi-client-search input { min-width: 0; border: 0; outline: 0; background: transparent; color: #3f4759; font-size: 12px; }
        .multi-client-search input::-webkit-search-cancel-button { display: none; }
        .multi-client-search button { width: 24px; height: 24px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 6px; color: #7c869a; background: transparent; }
        .multi-client-toolbar { min-height: 31px; padding: 6px 3px 5px; display: flex; justify-content: space-between; align-items: center; gap: 12px; border-bottom: 1px solid #eef0f5; }
        .multi-client-toolbar span { color: #8a93a5; font-size: 9px; font-weight: 750; }
        .multi-client-toolbar button { padding: 3px 5px; border: 0; color: #5d72f6; background: transparent; font-size: 9px; font-weight: 800; }
        .multi-client-toolbar button:disabled { color: #b4bac6; }
        .multi-client-list { max-height: 270px; padding: 5px 0 1px; overflow-y: auto; overscroll-behavior: contain; }
        .multi-client-list label {
          min-height: 34px; padding: 6px 7px; display: grid; grid-template-columns: 18px minmax(0,1fr);
          gap: 8px; align-items: center; border-radius: 7px; color: #303849; cursor: pointer;
          font-size: 11px; font-weight: 650;
        }
        .multi-client-list label:hover, .multi-client-list label.is-selected { background: #f1f3ff; }
        .multi-client-list label > input {
          position: absolute; width: 1px; height: 1px; margin: 0; opacity: 0;
          pointer-events: none; overflow: hidden; clip-path: inset(50%);
        }
        .multi-client-list label > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .multi-client-checkbox {
          width: 17px; height: 17px; display: grid; place-items: center; border: 1px solid #cfd5e1;
          border-radius: 4px; color: transparent; background: #fff;
        }
        .multi-client-list label.is-selected .multi-client-checkbox { color: #fff; border-color: #5d72f6; background: #5d72f6; }
        .multi-client-list > p { margin: 18px 8px; color: #929aac; font-size: 11px; text-align: center; }
        @media (max-width: 760px) {
          .client-filter, .client-filter .select-wrap, .multi-client-navigation { width: 100% !important; }
          .multi-client-popover { left: 0; right: auto; }
        }
        @media print { .multi-client-navigation { display: none !important; } }
      `}</style>
      {target && select ? createPortal(<MultiClientControl select={select} options={options} scope={scope} />, target) : null}
    </>
  );
}
