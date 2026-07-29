"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  canonicalClientName,
  clientKey,
  normalizeClientText,
  SAO_MATEUS_CANONICAL_NAME,
} from "@/lib/clientNames";
import type { ImportState } from "@/lib/types";

const STORAGE_KEY = "financial-analytics-data-v1";

type Scope = "overview" | "invoices" | "receipts" | "clients";
type ClientOption = { label: string; value: string };

type ReceiptAlias = {
  source: string;
  normalized: string;
  tokens: string[];
};

const RECEIPT_STOP_WORDS = new Set([
  "A", "AS", "O", "OS", "E", "EM", "DE", "DA", "DO", "DAS", "DOS",
  "ASSOCIACAO", "SOCIEDADE", "FUNDACAO", "INSTITUTO", "HOSPITAL",
  "MATERNIDADE", "CLINICA", "CENTRO", "GRUPO", "EMPRESA", "BENEFICENTE",
  "BENEFICENCIA", "SAUDE", "SERVICO", "SERVICOS", "LTDA", "EIRELI",
  "CNPJ", "SA", "SAN", "SPARN",
]);

const WEAK_SINGLE_TOKENS = new Set([
  "SANTA", "SANTO", "CASA", "CENTRO", "CLINICA", "HOSPITAL", "SAUDE",
  "MEDICA", "MEDICO",
]);

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

function cleanReceiptClient(value: string) {
  return value
    .replace(/\s*[-–—]?\s*NFS?[\s.:-].*$/i, "")
    .replace(/\s*[-–—]?\s*NOTAS?[\s.:-].*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function expandReceiptToken(token: string) {
  const normalized = normalizeClientText(token);
  if (!normalized) return "";

  if (/^ASSOC(?:E|IAC|IACAO)?$/.test(normalized)) return "ASSOCIACAO";
  if (/^GEST(?:AO)?$/.test(normalized)) return "GESTAO";
  if (/^INOV(?:ACAO)?$/.test(normalized)) return "INOVACAO";
  if (/^RESULT(?:ADO|ADOS)?$/.test(normalized)) return "RESULTADOS";
  if (/^HOSP(?:ITAL)?$/.test(normalized)) return "HOSPITAL";
  if (/^MAT(?:ERNIDADE)?$/.test(normalized)) return "MATERNIDADE";
  if (normalized === "STA") return "SANTA";
  if (normalized === "STO") return "SANTO";
  if (normalized === "AN") return "ANA";
  if (/^PORTUGU(?:E|ESA)?$/.test(normalized)) return "PORTUGUESA";
  if (/^BENEFIC(?:ENCIA|IENCIA)?$/.test(normalized)) return "BENEFICENCIA";
  if (/^CAMPINA(?:S)?$/.test(normalized)) return "CAMPINAS";
  if (/^FUND(?:ACAO)?$/.test(normalized)) return "FUNDACAO";
  if (/^INST(?:ITUTO)?$/.test(normalized)) return "INSTITUTO";
  if (/^SERV(?:ICO|ICOS)?$/.test(normalized)) return "SERVICOS";
  if (/^CLIN(?:ICA)?$/.test(normalized)) return "CLINICA";
  if (/^MED(?:ICA|ICO)?$/.test(normalized)) return "MEDICO";

  return normalized.length === 1 ? "" : normalized;
}

function receiptAlias(value: string): ReceiptAlias {
  const canonical = canonicalClientName(cleanReceiptClient(value));
  const normalized = normalizeClientText(canonical);
  const tokens: string[] = normalized
    .split(" ")
    .map(expandReceiptToken)
    .filter((token) => token && !RECEIPT_STOP_WORDS.has(token));

  return {
    source: canonical,
    normalized: tokens.join(" "),
    tokens: [...new Set(tokens)],
  };
}

function editDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost,
      );
    }
    for (let index = 0; index <= right.length; index += 1) previous[index] = current[index];
  }

  return previous[right.length];
}

function tokenMatches(left: string, right: string) {
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (shorter.length >= 4 && longer.startsWith(shorter)) return true;
  if (shorter.length < 5 || Math.abs(left.length - right.length) > 1 || left[0] !== right[0]) return false;
  return editDistance(left, right) <= 1;
}

function matchedTokenCount(left: string[], right: string[]) {
  const used = new Set<number>();
  let matches = 0;

  left.forEach((leftToken) => {
    const index = right.findIndex((rightToken, rightIndex) => !used.has(rightIndex) && tokenMatches(leftToken, rightToken));
    if (index >= 0) {
      used.add(index);
      matches += 1;
    }
  });

  return matches;
}

function shouldMergeReceiptAliases(left: ReceiptAlias, right: ReceiptAlias) {
  if (!left.normalized || !right.normalized) return false;
  if (left.source === SAO_MATEUS_CANONICAL_NAME && right.source === SAO_MATEUS_CANONICAL_NAME) return true;
  if (left.normalized === right.normalized) return true;

  const matches = matchedTokenCount(left.tokens, right.tokens);
  const minimumSize = Math.min(left.tokens.length, right.tokens.length);
  if (!minimumSize || !matches) return false;

  if (minimumSize >= 2 && matches >= 2 && matches / minimumSize >= 0.75) return true;

  if (minimumSize === 1 && matches === 1) {
    const shared = left.tokens.find((token) => right.tokens.some((candidate) => tokenMatches(token, candidate)));
    if (shared && shared.length >= 5 && !WEAK_SINGLE_TOKENS.has(shared)) {
      const shorter = left.normalized.length <= right.normalized.length ? left.normalized : right.normalized;
      const longer = left.normalized.length > right.normalized.length ? left.normalized : right.normalized;
      if (longer.includes(shorter)) return true;
    }
  }

  const longerLength = Math.max(left.normalized.length, right.normalized.length);
  const shorterLength = Math.min(left.normalized.length, right.normalized.length);
  const firstLeft = left.tokens[0];
  const firstRight = right.tokens[0];
  if (firstLeft && firstRight && tokenMatches(firstLeft, firstRight)
    && longerLength >= 8 && shorterLength / longerLength >= 0.65) {
    const similarity = 1 - editDistance(left.normalized, right.normalized) / longerLength;
    if (similarity >= 0.86) return true;
  }

  return false;
}

function receiptLabelScore(value: string) {
  const normalized = normalizeClientText(value);
  const words = normalized.split(" ").filter(Boolean);
  const singleLetterWords = words.filter((word) => word.length === 1).length;
  const abbreviationMarks = (value.match(/\./g) ?? []).length;
  const truncatedEnding = /\b(?:PORTUGU|PORTUGUE|BENEFIC|CAMPINA|AN)$/i.test(normalized) ? 1 : 0;
  return words.filter((word) => word.length >= 5).length * 12
    + normalized.length * 0.25
    - singleLetterWords * 18
    - abbreviationMarks * 5
    - truncatedEnding * 30;
}

function formatReceiptLabel(value: string) {
  const canonical = canonicalClientName(cleanReceiptClient(value));
  if (canonical === SAO_MATEUS_CANONICAL_NAME) return canonical;

  return canonical
    .toUpperCase()
    .replace(/\bASSOC(?:E|IAC|IACAO)?\.?\b/g, "ASSOCIAÇÃO")
    .replace(/\bASSOCIACAO\b/g, "ASSOCIAÇÃO")
    .replace(/\bGESTAO\b/g, "GESTÃO")
    .replace(/\bINOVACAO\b/g, "INOVAÇÃO")
    .replace(/\bRESULT(?:ADO|ADOS)?\.?\b/g, "RESULTADOS")
    .replace(/\bHOSP\.?\b/g, "HOSPITAL")
    .replace(/\bMAT\.?\b/g, "MATERNIDADE")
    .replace(/\bSTA\.?\b/g, "SANTA")
    .replace(/\bSTO\.?\b/g, "SANTO")
    .replace(/\bSAUDE\b/g, "SAÚDE")
    .replace(/\bFUNDACAO\b/g, "FUNDAÇÃO")
    .replace(/\bBENEFIC(?:ENCIA|IENCIA)?\b/g, "BENEFICÊNCIA")
    .replace(/\bPORTUGU(?:E|ESA)?\b/g, "PORTUGUESA")
    .replace(/\bCAMPINA(?:S)?\b/g, "CAMPINAS")
    .replace(/\s*[|/–—-]+\s*/g, " | ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\.\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+\|\s+(?:SAN|SPARN)$/i, "")
    .trim();
}

function buildReceiptStandardization(names: string[]) {
  const uniqueAliases = [...new Map(names
    .map((name) => cleanReceiptClient(name))
    .filter(Boolean)
    .map((name) => [normalizeClientText(name), name] as const)).values()];
  const aliases = uniqueAliases.map(receiptAlias);
  const parents = aliases.map((_, index) => index);

  function find(index: number): number {
    if (parents[index] !== index) parents[index] = find(parents[index]);
    return parents[index];
  }

  function unite(left: number, right: number) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  }

  for (let left = 0; left < aliases.length; left += 1) {
    for (let right = left + 1; right < aliases.length; right += 1) {
      if (shouldMergeReceiptAliases(aliases[left], aliases[right])) unite(left, right);
    }
  }

  const groups = new Map<number, string[]>();
  uniqueAliases.forEach((name, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(name);
    groups.set(root, group);
  });

  const labelByAlias = new Map<string, string>();
  const labels: string[] = [];

  groups.forEach((group) => {
    const explicitSaoMateus = group.some((name) => canonicalClientName(name) === SAO_MATEUS_CANONICAL_NAME);
    const best = explicitSaoMateus
      ? SAO_MATEUS_CANONICAL_NAME
      : [...group].sort((left, right) => {
        const rightScore = receiptAlias(right).tokens.length * 50 + receiptLabelScore(right);
        const leftScore = receiptAlias(left).tokens.length * 50 + receiptLabelScore(left);
        return rightScore - leftScore;
      })[0];
    const label = explicitSaoMateus ? SAO_MATEUS_CANONICAL_NAME : formatReceiptLabel(best);
    labels.push(label);
    group.forEach((name) => labelByAlias.set(normalizeClientText(name), label));
    labelByAlias.set(normalizeClientText(label), label);
  });

  return {
    labelByAlias,
    labels: [...new Set(labels)].sort((left, right) => left.localeCompare(right, "pt-BR")),
  };
}

function standardizeReceiptClients(data: ImportState) {
  if (!data.receipts.length) return { data, changed: false };

  const names = data.receipts.map((receipt) => receipt.clientHint || receipt.description);
  const catalog = buildReceiptStandardization(names);
  let changed = false;
  const receipts = data.receipts.map((receipt) => {
    const source = cleanReceiptClient(receipt.clientHint || receipt.description);
    const label = catalog.labelByAlias.get(normalizeClientText(source));
    if (!label || label === receipt.clientHint) return receipt;
    changed = true;
    return { ...receipt, clientHint: label };
  });

  return { data: changed ? { ...data, receipts } : data, changed };
}

function sourceNames(data: ImportState, scope: Scope) {
  const invoiceNames = data.invoices.map((item) => item.clientName);
  const receiptNames = data.receipts.map((item) => item.clientHint || item.description);
  if (scope === "invoices") return invoiceNames;
  if (scope === "receipts") return receiptNames;
  return [...invoiceNames, ...receiptNames];
}

function buildOptions(data: ImportState, scope: Scope): ClientOption[] {
  if (scope === "receipts") {
    return buildReceiptStandardization(sourceNames(data, scope)).labels.map((label) => ({ label, value: label }));
  }

  const grouped = new Map<string, ClientOption>();
  sourceNames(data, scope).forEach((rawName) => {
    const label = canonicalClientName(rawName);
    const key = clientKey(label);
    if (!label || !key || grouped.has(key)) return;
    grouped.set(key, { label, value: label });
  });
  return [...grouped.values()].sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
}

function optionIdentity(value: string) {
  return normalizeClientText(value);
}

function setNativeSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (setter) setter.call(select, value);
  else select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function ensureNativeOption(select: HTMLSelectElement, option: ClientOption) {
  const existing = Array.from(select.options).find((item) => optionIdentity(item.value) === optionIdentity(option.value));
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

  const selectedIndex = options.findIndex((option) => optionIdentity(option.value) === optionIdentity(selectedValue));
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
          {options.map((option) => <option key={optionIdentity(option.label)} value={option.label} />)}
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
  const standardizingRef = useRef(false);

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
        const parsed = readData(raw);
        const standardized = standardizeReceiptClients(parsed);
        if (standardized.changed && !standardizingRef.current) {
          standardizingRef.current = true;
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(standardized.data));
          window.location.reload();
          return;
        }
        signatureRef.current = signature;
        setData(standardized.data);
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
    (Array.from(select.options) as HTMLOptionElement[])
      .filter((option) => option.dataset.scopedClient === "true")
      .forEach((option) => option.remove());
    options.forEach((option) => ensureNativeOption(select, option));
    if (select.value && !options.some((option) => optionIdentity(option.value) === optionIdentity(select.value))) {
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
