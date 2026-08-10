"use client";

import { Check, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { canonicalClientName, clientKey } from "@/lib/clientNames";
import { joinClientSelection, splitClientSelection } from "@/lib/clientSelection";
import { ANALYSIS_DATA_EVENT, loadAnalysisState } from "@/lib/offlineStorage";
import { canonicalReceiptClientName, receiptClientKey } from "@/lib/receiptClientNames";
import type { ImportState } from "@/lib/types";

type Scope = "overview" | "invoices" | "receipts" | "clients";
type SeriesMode = "both" | "emitted" | "received";
type IdentityMode = "invoice" | "receipt" | "combined";
type ClientOption = { label: string; value: string };

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function readScope(): Scope {
  const title = normalize(document.querySelector<HTMLElement>(".topbar-title h1")?.textContent ?? "");
  if (title === "EMISSOES") return "invoices";
  if (title === "RECEBIMENTOS") return "receipts";
  if (title === "CLIENTES") return "clients";
  return "overview";
}

function readSeriesMode(): SeriesMode {
  const panel = Array.from(document.querySelectorAll<HTMLElement>(".panel")).find(
    (item) => item.querySelector(".panel-header h2")?.textContent?.trim() === "Emitido × recebido",
  );
  const mode = panel?.dataset.seriesMode;
  return mode === "emitted" || mode === "received" ? mode : "both";
}

function identityFor(scope: Scope, seriesMode: SeriesMode): IdentityMode {
  if (scope === "receipts" || (scope === "overview" && seriesMode === "received")) return "receipt";
  if (scope === "invoices" || (scope === "overview" && seriesMode === "emitted")) return "invoice";
  return "combined";
}

function keyForIdentity(value: string, identity: IdentityMode) {
  if (identity === "receipt") return receiptClientKey(value);
  if (identity === "invoice") return clientKey(value);
  return clientKey(canonicalReceiptClientName(value) || canonicalClientName(value));
}

function buildOptions(data: ImportState, scope: Scope, seriesMode: SeriesMode): ClientOption[] {
  const identity = identityFor(scope, seriesMode);
  const grouped = new Map<string, ClientOption>();

  const addInvoice = (rawName: string) => {
    const label = canonicalClientName(rawName);
    const key = keyForIdentity(label, identity);
    if (!label || !key || grouped.has(key)) return;
    grouped.set(key, { label, value: label });
  };

  const addReceipt = (rawName: string) => {
    const label = canonicalReceiptClientName(rawName);
    const key = keyForIdentity(label, identity);
    if (!label || !key || grouped.has(key)) return;
    grouped.set(key, { label, value: label });
  };

  if (scope === "invoices" || (scope === "overview" && seriesMode === "emitted")) {
    data.invoices.forEach((item) => addInvoice(item.clientName));
  } else if (scope === "receipts" || (scope === "overview" && seriesMode === "received")) {
    data.receipts.forEach((item) => addReceipt(item.clientHint || item.description));
  } else {
    data.invoices.forEach((item) => addInvoice(item.clientName));
    data.receipts.forEach((item) => addReceipt(item.clientHint || item.description));
  }

  return [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function labelForSelection(value: string, identity: IdentityMode) {
  return identity === "receipt"
    ? canonicalReceiptClientName(value)
    : canonicalClientName(value);
}

function setNativeSelect(select: HTMLSelectElement, value: string, dispatch = true) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  if (dispatch) select.dispatchEvent(new Event("change", { bubbles: true }));
}

function ensureNativeOption(select: HTMLSelectElement, option: ClientOption, identity: IdentityMode) {
  const optionKey = keyForIdentity(option.value, identity);
  const existing = Array.from(select.options).find((item) =>
    item.dataset.multiClient !== "true" && keyForIdentity(item.value, identity) === optionKey,
  );
  if (existing) return existing.value;

  const native = document.createElement("option");
  native.value = option.value;
  native.textContent = option.label;
  native.dataset.scopedClient = "true";
  select.appendChild(native);
  return native.value;
}

function selectionSummary(selected: string[], identity: IdentityMode) {
  if (!selected.length) return "Todos os clientes";
  if (selected.length === 1) return labelForSelection(selected[0], identity);
  return `${selected.length} clientes selecionados`;
}

function ensureSelectionValue(
  select: HTMLSelectElement,
  selected: string[],
  options: ClientOption[],
  identity: IdentityMode,
) {
  const encoded = joinClientSelection(selected);

  Array.from(select.options)
    .filter((option) => option.dataset.multiClient === "true" && option.value !== encoded)
    .forEach((option) => option.remove());

  if (!selected.length) return "";

  if (selected.length === 1) {
    const key = keyForIdentity(selected[0], identity);
    const option = options.find((item) => keyForIdentity(item.value, identity) === key)
      ?? { label: labelForSelection(selected[0], identity), value: selected[0] };
    return ensureNativeOption(select, option, identity);
  }

  let native = Array.from(select.options).find((option) => option.value === encoded);
  if (!native) {
    native = document.createElement("option");
    native.value = encoded;
    native.dataset.multiClient = "true";
    select.appendChild(native);
  }
  native.textContent = selectionSummary(selected, identity);
  return native.value;
}

function MultiClientControl({
  select,
  options,
  identity,
}: {
  select: HTMLSelectElement;
  options: ClientOption[];
  identity: IdentityMode;
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
    const nativeValue = ensureSelectionValue(select, selected, options, identity);
    if (select.value !== nativeValue) setNativeSelect(select, nativeValue, false);
  }, [select, selected, options, identity]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus({ preventScroll: true });

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
    () => new Set(selected.map((value) => keyForIdentity(value, identity)).filter(Boolean)),
    [selected, identity],
  );

  const visibleOptions = useMemo(() => {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return options;
    return options.filter((option) => normalize(option.label).includes(normalizedQuery));
  }, [options, query]);

  function applySelection(next: string[]) {
    const pageScroll = { x: window.scrollX, y: window.scrollY };
    const listScrollTop = listRef.current?.scrollTop ?? 0;
    const restoreScroll = () => {
      window.scrollTo(pageScroll.x, pageScroll.y);
      if (listRef.current) listRef.current.scrollTop = listScrollTop;
    };
    const unique = [...new Map(next.map((value) => [keyForIdentity(value, identity), value])).values()]
      .filter(Boolean);
    const nativeValue = ensureSelectionValue(select, unique, options, identity);
    setSelected(unique);
    setNativeSelect(select, nativeValue);

    restoreScroll();
    window.setTimeout(restoreScroll, 0);
    requestAnimationFrame(() => {
      restoreScroll();
      requestAnimationFrame(restoreScroll);
    });
  }

  function toggle(option: ClientOption) {
    const key = keyForIdentity(option.value, identity);
    const exists = selectedKeys.has(key);
    const next = exists
      ? selected.filter((value) => keyForIdentity(value, identity) !== key)
      : [...selected, option.value];
    applySelection(next);
  }

  function navigateClient(direction: -1 | 1) {
    if (!options.length) return;

    const anchor = selected[selected.length - 1] ?? "";
    const currentIndex = anchor
      ? options.findIndex((option) => keyForIdentity(option.value, identity) === keyForIdentity(anchor, identity))
      : -1;
    const nextIndex = currentIndex < 0
      ? (direction > 0 ? 0 : options.length - 1)
      : (currentIndex + direction + options.length) % options.length;

    applySelection([options[nextIndex].value]);
    setOpen(false);
    setQuery("");
  }

  const summary = selectionSummary(selected, identity);
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
                const checked = selectedKeys.has(keyForIdentity(option.value, identity));
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    key={keyForIdentity(option.value, identity)}
                    className={checked ? "is-selected" : ""}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggle(option)}
                  >
                    <span className="multi-client-checkbox"><Check size={12} /></span>
                    <span title={option.label}>{option.label}</span>
                  </button>
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

export default function ScopedClientFilterEnhancerV2() {
  const [select, setSelect] = useState<HTMLSelectElement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<ImportState>({ invoices: [], receipts: [] });
  const [scope, setScope] = useState<Scope>("overview");
  const [seriesMode, setSeriesMode] = useState<SeriesMode>("both");

  useEffect(() => {
    let active = true;
    void loadAnalysisState().then((stored) => {
      if (active && stored) setData(stored);
    });
    const handleData = (event: Event) => {
      setData((event as CustomEvent<ImportState>).detail);
    };
    window.addEventListener(ANALYSIS_DATA_EVENT, handleData);
    return () => {
      active = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, handleData);
    };
  }, []);

  useEffect(() => {
    const sync = () => {
      const nextSelect = document.querySelector<HTMLSelectElement>(".client-filter select");
      const nextTarget = nextSelect?.parentElement ?? null;
      const nextScope = readScope();
      const nextSeriesMode = nextScope === "overview" ? readSeriesMode() : "both";
      setSelect((current) => current === nextSelect ? current : nextSelect);
      setTarget((current) => current === nextTarget ? current : nextTarget);
      setScope((current) => current === nextScope ? current : nextScope);
      setSeriesMode((current) => current === nextSeriesMode ? current : nextSeriesMode);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-series-mode"] });
    const timer = window.setInterval(sync, 350);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  const identity = useMemo(() => identityFor(scope, seriesMode), [scope, seriesMode]);
  const options = useMemo(() => buildOptions(data, scope, seriesMode), [data, scope, seriesMode]);

  useEffect(() => {
    if (!select) return;
    options.forEach((option) => ensureNativeOption(select, option, identity));

    const current = splitClientSelection(select.value);
    const valid = current.filter((value) =>
      options.some((option) => keyForIdentity(option.value, identity) === keyForIdentity(value, identity)),
    );

    if (joinClientSelection(current) !== joinClientSelection(valid)) {
      const nativeValue = ensureSelectionValue(select, valid, options, identity);
      setNativeSelect(select, nativeValue);
    } else {
      const nativeValue = ensureSelectionValue(select, current, options, identity);
      if (select.value !== nativeValue) setNativeSelect(select, nativeValue, false);
    }
  }, [select, options, identity]);

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
        .multi-client-list > button {
          width: 100%; border: 0; background: transparent; text-align: left;
          min-height: 34px; padding: 6px 7px; display: grid; grid-template-columns: 18px minmax(0,1fr);
          gap: 8px; align-items: center; border-radius: 7px; color: #303849; cursor: pointer;
          font-size: 11px; font-weight: 650;
        }
        .multi-client-list > button:hover, .multi-client-list > button.is-selected { background: #f1f3ff; }
        .multi-client-list > button:focus-visible { outline: 2px solid #5d72f6; outline-offset: -2px; }
        .multi-client-list > button > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .multi-client-checkbox {
          width: 17px; height: 17px; display: grid; place-items: center; border: 1px solid #cfd5e1;
          border-radius: 4px; color: transparent; background: #fff;
        }
        .multi-client-list > button.is-selected .multi-client-checkbox { color: #fff; border-color: #5d72f6; background: #5d72f6; }
        .multi-client-list > p { margin: 18px 8px; color: #929aac; font-size: 11px; text-align: center; }
        @media (max-width: 760px) {
          .client-filter, .client-filter .select-wrap, .multi-client-navigation { width: 100% !important; }
          .multi-client-popover { left: 0; right: auto; }
        }
        @media print { .multi-client-navigation { display: none !important; } }
      `}</style>
      {target && select ? createPortal(<MultiClientControl select={select} options={options} identity={identity} />, target) : null}
    </>
  );
}
