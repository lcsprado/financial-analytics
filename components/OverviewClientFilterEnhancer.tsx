"use client";

import { Check, ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { canonicalInvoiceClientName, clientKey, normalizeClientText } from "@/lib/clientNames";
import { joinClientSelection, splitClientSelection } from "@/lib/clientSelection";
import { ANALYSIS_DATA_EVENT, loadAnalysisState } from "@/lib/offlineStorage";
import {
  listOverviewClientLinks,
  OVERVIEW_CLIENT_LINKS_EVENT,
  overviewAliasKey,
  type OverviewClientLink,
} from "@/lib/overviewClientLinks";
import {
  listReceiptClientLinks,
  RECEIPT_CLIENT_LINKS_EVENT,
  type ReceiptClientLink,
} from "@/lib/receiptClientLinks";
import { canonicalReceiptClientName } from "@/lib/receiptClientNames";
import type { ImportState } from "@/lib/types";

type SeriesMode = "both" | "emitted" | "received";
type ClientOption = { key: string; label: string; filterValues: string[] };

function normalize(value: string) {
  return normalizeClientText(value);
}

function readSeriesMode(): SeriesMode {
  const panel = Array.from(document.querySelectorAll<HTMLElement>(".panel")).find(
    (item) => item.querySelector(".panel-header h2")?.textContent?.trim() === "Emitido × recebido",
  );
  const mode = panel?.dataset.seriesMode;
  return mode === "emitted" || mode === "received" ? mode : "both";
}

function logicalKey(value: string) {
  return clientKey(canonicalReceiptClientName(value) || value) || normalize(value);
}

function buildOptions(
  data: ImportState,
  links: OverviewClientLink[],
  receiptLinks: ReceiptClientLink[],
  seriesMode: SeriesMode,
) {
  const byAlias = new Map(links.map((link) => [link.alias_key, link] as const));
  const overviewMembers = new Map<string, string[]>();
  links.forEach((link) => {
    const members = overviewMembers.get(link.group_id) ?? [];
    if (!members.some((value) => normalize(value) === normalize(link.alias_name))) {
      members.push(link.alias_name);
    }
    overviewMembers.set(link.group_id, members);
  });

  // Recebimentos podem chegar ao painel já com o nome canônico de um vínculo
  // próprio da aba Recebimentos. Se qualquer alias daquele vínculo pertence a
  // um grupo da Visão Geral, o nome canônico também deve cair no mesmo grupo.
  const receiptGroups = new Map<string, ReceiptClientLink[]>();
  receiptLinks.forEach((link) => {
    const group = receiptGroups.get(link.group_id) ?? [];
    group.push(link);
    receiptGroups.set(link.group_id, group);
  });

  const overviewByReceiptIdentity = new Map<string, OverviewClientLink>();
  receiptGroups.forEach((group) => {
    const overviewLink = group
      .map((link) => byAlias.get(overviewAliasKey(link.alias_name)))
      .find((link): link is OverviewClientLink => Boolean(link));
    if (!overviewLink) return;

    group.forEach((link) => {
      const canonicalKey = normalize(canonicalReceiptClientName(link.canonical_name));
      const aliasKey = normalize(canonicalReceiptClientName(link.alias_name));
      if (canonicalKey && !overviewByReceiptIdentity.has(canonicalKey)) {
        overviewByReceiptIdentity.set(canonicalKey, overviewLink);
      }
      if (aliasKey && !overviewByReceiptIdentity.has(aliasKey)) {
        overviewByReceiptIdentity.set(aliasKey, overviewLink);
      }
    });
  });

  const grouped = new Map<string, ClientOption>();

  const add = (label: string) => {
    const cleaned = label.replace(/\s+/g, " ").trim();
    if (!cleaned) return;

    const directManual = byAlias.get(overviewAliasKey(cleaned));
    const receiptManual = overviewByReceiptIdentity.get(normalize(canonicalReceiptClientName(cleaned)));
    const manual = directManual || receiptManual;
    const key = manual ? `OVERVIEW:${manual.group_id}` : `CLIENT:${logicalKey(cleaned)}`;
    const display = manual?.canonical_name || cleaned;
    const groupValues = manual ? overviewMembers.get(manual.group_id) ?? [] : [];
    const values = [...groupValues, cleaned];

    const current = grouped.get(key);
    if (current) {
      values.forEach((value) => {
        if (!current.filterValues.some((item) => normalize(item) === normalize(value))) {
          current.filterValues.push(value);
        }
      });
      return;
    }

    const filterValues: string[] = [];
    values.forEach((value) => {
      if (value && !filterValues.some((item) => normalize(item) === normalize(value))) {
        filterValues.push(value);
      }
    });
    grouped.set(key, { key, label: display, filterValues });
  };

  if (seriesMode !== "received") {
    data.invoices.forEach((invoice) => add(canonicalInvoiceClientName(invoice.clientName)));
  }
  if (seriesMode !== "emitted") {
    data.receipts.forEach((receipt) => add(canonicalReceiptClientName(receipt.clientHint || receipt.description)));
  }

  return [...grouped.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

function optionKeysFromNative(value: string, options: ClientOption[]) {
  const keys: string[] = [];
  splitClientSelection(value).forEach((raw) => {
    const n = normalize(raw);
    const option = options.find((item) => item.filterValues.some((candidate) => normalize(candidate) === n));
    if (option && !keys.includes(option.key)) keys.push(option.key);
  });
  return keys;
}

function nativeValuesForKeys(keys: string[], options: ClientOption[]) {
  const values: string[] = [];
  const seen = new Set<string>();
  keys.forEach((key) => {
    const option = options.find((item) => item.key === key);
    option?.filterValues.forEach((value) => {
      const n = normalize(value);
      if (!n || seen.has(n)) return;
      seen.add(n);
      values.push(value);
    });
  });
  return values;
}

function setNativeSelect(select: HTMLSelectElement, value: string, dispatch = true) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  if (dispatch) select.dispatchEvent(new Event("change", { bubbles: true }));
}

function ensureNativeValue(select: HTMLSelectElement, values: string[], label: string) {
  const encoded = joinClientSelection(values);
  Array.from(select.options)
    .filter((option) => option.dataset.overviewGroup === "true" && option.value !== encoded)
    .forEach((option) => option.remove());

  if (!values.length) return "";
  if (values.length === 1) {
    const n = normalize(values[0]);
    const existing = Array.from(select.options).find((option) => normalize(option.value) === n);
    if (existing) return existing.value;
  }

  let option = Array.from(select.options).find((item) => item.value === encoded);
  if (!option) {
    option = document.createElement("option");
    option.value = encoded;
    option.dataset.overviewGroup = "true";
    select.appendChild(option);
  }
  option.textContent = label;
  return option.value;
}

function OverviewControl({ select, options }: { select: HTMLSelectElement; options: ClientOption[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => optionKeysFromNative(select.value, options));

  useEffect(() => {
    const sync = () => {
      const next = optionKeysFromNative(select.value, options);
      setSelectedKeys((current) => current.join("\u001f") === next.join("\u001f") ? current : next);
    };
    select.addEventListener("change", sync);
    sync();
    return () => select.removeEventListener("change", sync);
  }, [select, options]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus({ preventScroll: true });
    const outside = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const selected = selectedKeys.map((key) => options.find((item) => item.key === key)).filter((item): item is ClientOption => Boolean(item));
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const visible = useMemo(() => {
    const q = normalize(query);
    if (!q) return options;
    return options.filter((option) => normalize(option.label).includes(q) || option.filterValues.some((value) => normalize(value).includes(q)));
  }, [options, query]);

  function apply(keys: string[]) {
    const valid = [...new Set(keys)].filter((key) => options.some((option) => option.key === key));
    const values = nativeValuesForKeys(valid, options);
    const label = valid.length === 1
      ? options.find((option) => option.key === valid[0])?.label || values[0] || ""
      : `${valid.length} clientes selecionados`;
    const nativeValue = ensureNativeValue(select, values, label);
    setSelectedKeys(valid);
    setNativeSelect(select, nativeValue);
  }

  function toggle(option: ClientOption) {
    apply(selectedSet.has(option.key)
      ? selectedKeys.filter((key) => key !== option.key)
      : [...selectedKeys, option.key]);
  }

  function navigate(direction: -1 | 1) {
    if (!options.length) return;
    const anchor = selectedKeys[selectedKeys.length - 1] ?? "";
    const current = anchor ? options.findIndex((option) => option.key === anchor) : -1;
    const next = current < 0
      ? (direction > 0 ? 0 : options.length - 1)
      : (current + direction + options.length) % options.length;
    apply([options[next].key]);
    setOpen(false);
    setQuery("");
  }

  const summary = !selected.length ? "Todos os clientes" : selected.length === 1 ? selected[0].label : `${selected.length} clientes selecionados`;
  const position = selected.length === 1 ? options.findIndex((option) => option.key === selected[0].key) : -1;
  const count = position >= 0 ? `${position + 1}/${options.length}` : selected.length ? `${selected.length}/${options.length}` : `${options.length}`;

  return (
    <div className="multi-client-navigation" ref={rootRef}>
      <div className="multi-client-filter">
        <button type="button" className={`multi-client-trigger ${open ? "is-open" : ""}`} onClick={() => setOpen((value) => !value)}>
          <span title={summary}>{summary}</span><em>{count}</em><ChevronDown size={15} />
        </button>
        {open ? (
          <div className="multi-client-popover">
            <div className="multi-client-search"><Search size={15} /><input ref={searchRef} type="search" value={query} placeholder="Buscar cliente" onChange={(event) => setQuery(event.target.value)} />{query ? <button type="button" aria-label="Limpar busca" onClick={() => setQuery("")}><X size={14} /></button> : null}</div>
            <div className="multi-client-toolbar"><span>{selected.length ? `${selected.length} selecionado${selected.length > 1 ? "s" : ""}` : "Nenhum selecionado"}</span><button type="button" onClick={() => apply([])} disabled={!selected.length}>Limpar seleção</button></div>
            <div ref={listRef} className="multi-client-list" role="listbox" aria-multiselectable="true">
              {visible.map((option) => <button type="button" role="option" aria-selected={selectedSet.has(option.key)} key={option.key} className={selectedSet.has(option.key) ? "is-selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => toggle(option)}><span className="multi-client-checkbox"><Check size={12} /></span><span title={option.label}>{option.label}</span></button>)}
              {!visible.length ? <p>Nenhum cliente encontrado.</p> : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="multi-client-arrows" role="group" aria-label="Navegar entre clientes">
        <button type="button" aria-label="Cliente anterior" title="Cliente anterior" disabled={!options.length} onClick={() => navigate(-1)}><ChevronUp size={13} /></button>
        <button type="button" aria-label="Próximo cliente" title="Próximo cliente" disabled={!options.length} onClick={() => navigate(1)}><ChevronDown size={13} /></button>
      </div>
    </div>
  );
}

export default function OverviewClientFilterEnhancer() {
  const [select, setSelect] = useState<HTMLSelectElement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [data, setData] = useState<ImportState>({ invoices: [], receipts: [] });
  const [links, setLinks] = useState<OverviewClientLink[]>([]);
  const [receiptLinks, setReceiptLinks] = useState<ReceiptClientLink[]>([]);
  const [seriesMode, setSeriesMode] = useState<SeriesMode>("both");

  useEffect(() => {
    let active = true;
    void Promise.all([loadAnalysisState(), listOverviewClientLinks(), listReceiptClientLinks()]).then(([stored, nextLinks, nextReceiptLinks]) => {
      if (!active) return;
      if (stored) setData(stored);
      setLinks(nextLinks);
      setReceiptLinks(nextReceiptLinks);
    });
    const onData = (event: Event) => setData((event as CustomEvent<ImportState>).detail);
    const onLinks = () => { void listOverviewClientLinks().then(setLinks); };
    const onReceiptLinks = () => { void listReceiptClientLinks().then(setReceiptLinks); };
    window.addEventListener(ANALYSIS_DATA_EVENT, onData);
    window.addEventListener(OVERVIEW_CLIENT_LINKS_EVENT, onLinks);
    window.addEventListener(RECEIPT_CLIENT_LINKS_EVENT, onReceiptLinks);
    return () => {
      active = false;
      window.removeEventListener(ANALYSIS_DATA_EVENT, onData);
      window.removeEventListener(OVERVIEW_CLIENT_LINKS_EVENT, onLinks);
      window.removeEventListener(RECEIPT_CLIENT_LINKS_EVENT, onReceiptLinks);
    };
  }, []);

  useEffect(() => {
    let frame: number | null = null;
    const sync = () => {
      frame = null;
      const nextSelect = document.querySelector<HTMLSelectElement>(".client-filter select");
      setSelect((current) => current === nextSelect ? current : nextSelect);
      setTarget((current) => current === nextSelect?.parentElement ? current : nextSelect?.parentElement ?? null);
      const mode = readSeriesMode();
      setSeriesMode((current) => current === mode ? current : mode);
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(sync); };
    const onClick = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element?.closest(".clear-filter")) {
        const clientSelect = document.querySelector<HTMLSelectElement>(".client-filter select");
        if (clientSelect) setNativeSelect(clientSelect, "");
      }
      schedule();
    };
    sync();
    document.addEventListener("click", onClick, true);
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-series-mode"] });
    return () => {
      document.removeEventListener("click", onClick, true);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  const options = useMemo(
    () => buildOptions(data, links, receiptLinks, seriesMode),
    [data, links, receiptLinks, seriesMode],
  );

  useEffect(() => {
    if (!select) return;
    const keys = optionKeysFromNative(select.value, options);
    if (!keys.length && select.value) setNativeSelect(select, "");
  }, [select, options]);

  return (
    <>
      <style jsx global>{`
        .client-filter-navigation{display:none!important}.client-filter .select-wrap{width:292px!important;overflow:visible!important}.multi-client-navigation{width:292px;display:grid;grid-template-columns:minmax(0,1fr) 32px;gap:5px;align-items:stretch}.multi-client-filter{position:relative;min-width:0}.multi-client-trigger{width:100%;height:34px;padding:0 9px 0 11px;display:grid;grid-template-columns:minmax(0,1fr) auto 16px;gap:7px;align-items:center;color:#50596c;background:#f8f9fc;border:1px solid #e6e9f0;border-radius:8px;font-size:12px;font-weight:650;text-align:left}.multi-client-trigger:hover,.multi-client-trigger.is-open{border-color:#9aa8fb;background:#fff;box-shadow:0 0 0 3px rgba(93,114,246,.1)}.multi-client-trigger>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.multi-client-trigger em{min-width:30px;padding:3px 5px;border-radius:5px;color:#727c91;background:#edf0f6;font-size:8px;font-style:normal;font-weight:850;text-align:center}.multi-client-trigger svg{transition:transform .16s ease}.multi-client-trigger.is-open svg{transform:rotate(180deg)}.multi-client-arrows{height:34px;display:grid;grid-template-rows:repeat(2,1fr);gap:2px}.multi-client-arrows button{min-width:32px;padding:0;display:grid;place-items:center;border:1px solid #e1e5ee;color:#687288;background:linear-gradient(#fff,#f6f8fb);box-shadow:0 1px 2px rgba(35,45,70,.06);transition:.16s ease}.multi-client-arrows button:first-child{border-radius:7px 7px 4px 4px}.multi-client-arrows button:last-child{border-radius:4px 4px 7px 7px}.multi-client-arrows button:hover:not(:disabled){color:#fff;border-color:#5d72f6;background:#5d72f6}.multi-client-arrows button:disabled{opacity:.38;cursor:not-allowed}.multi-client-popover{position:absolute;z-index:1200;top:calc(100% + 7px);right:0;width:min(410px,calc(100vw - 30px));padding:9px;border:1px solid #e1e5ed;border-radius:11px;background:#fff;box-shadow:0 16px 38px rgba(28,37,61,.17)}.multi-client-search{height:36px;display:grid;grid-template-columns:18px minmax(0,1fr) auto;gap:6px;align-items:center;padding:0 8px;border:1px solid #e6e9f0;border-radius:8px;background:#f8f9fc;color:#8992a5}.multi-client-search input{position:static!important;width:100%!important;min-width:0!important;height:auto!important;padding:0!important;margin:0!important;border:0!important;outline:0;background:transparent;color:#3f4759;font-size:12px}.multi-client-search button{width:24px;height:24px;display:grid;place-items:center;padding:0;border:0;border-radius:6px;color:#7c869a;background:transparent}.multi-client-toolbar{min-height:31px;padding:6px 3px 5px;display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #eef0f5}.multi-client-toolbar span{color:#8a93a5;font-size:9px;font-weight:750}.multi-client-toolbar button{padding:3px 5px;border:0;color:#5d72f6;background:transparent;font-size:9px;font-weight:800}.multi-client-list{max-height:270px;padding:5px 0 1px;overflow-y:auto;overscroll-behavior:contain}.multi-client-list>button{width:100%;border:0;background:transparent;text-align:left;min-height:34px;padding:6px 7px;display:grid;grid-template-columns:18px minmax(0,1fr);gap:8px;align-items:center;border-radius:7px;color:#303849;cursor:pointer;font-size:11px;font-weight:650}.multi-client-list>button:hover,.multi-client-list>button.is-selected{background:#f1f3ff}.multi-client-list>button>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.multi-client-checkbox{width:17px;height:17px;display:grid;place-items:center;border:1px solid #cfd5e1;border-radius:4px;color:transparent;background:#fff}.multi-client-list>button.is-selected .multi-client-checkbox{color:#fff;border-color:#5d72f6;background:#5d72f6}.multi-client-list>p{margin:18px 8px;color:#929aac;font-size:11px;text-align:center}.client-filter .select-wrap .multi-client-navigation svg{position:static!important;inset:auto!important;transform:none!important;pointer-events:none!important}.client-filter .select-wrap .multi-client-trigger.is-open>svg{transform:rotate(180deg)!important}@media(max-width:760px){.client-filter,.client-filter .select-wrap,.multi-client-navigation{width:100%!important}.multi-client-popover{left:0;right:auto}}@media print{.multi-client-navigation{display:none!important}}
      `}</style>
      {target && select ? createPortal(<OverviewControl select={select} options={options} />, target) : null}
    </>
  );
}
