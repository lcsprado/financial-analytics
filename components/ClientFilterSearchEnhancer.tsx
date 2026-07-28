"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ClientOption = {
  label: string;
  value: string;
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function readOptions(select: HTMLSelectElement): ClientOption[] {
  return Array.from(select.options)
    .filter((option) => option.value)
    .map((option) => ({
      value: option.value,
      label: option.textContent?.trim() || option.value,
    }));
}

function changeNativeSelect(select: HTMLSelectElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;

  if (valueSetter) valueSetter.call(select, value);
  else select.value = value;

  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function ClientSearchControl({ select }: { select: HTMLSelectElement }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsSignatureRef = useRef("");
  const [options, setOptions] = useState<ClientOption[]>(() => readOptions(select));
  const [selectedValue, setSelectedValue] = useState(select.value);
  const [text, setText] = useState(() => {
    const selected = select.options[select.selectedIndex];
    return select.value ? selected?.textContent?.trim() || select.value : "";
  });
  const listId = `client-filter-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    const sync = () => {
      const nextOptions = readOptions(select);
      const signature = nextOptions.map((option) => `${option.value}\u0000${option.label}`).join("\u0001");

      if (signature !== optionsSignatureRef.current) {
        optionsSignatureRef.current = signature;
        setOptions(nextOptions);
      }

      setSelectedValue((current) => current === select.value ? current : select.value);

      if (document.activeElement !== inputRef.current) {
        const selected = select.options[select.selectedIndex];
        const selectedLabel = select.value
          ? selected?.textContent?.trim() || select.value
          : "";
        setText(selectedLabel);
      }
    };

    sync();
    select.addEventListener("change", sync);
    const optionObserver = new MutationObserver(sync);
    optionObserver.observe(select, { childList: true, subtree: true });
    const timer = window.setInterval(sync, 350);

    return () => {
      window.clearInterval(timer);
      optionObserver.disconnect();
      select.removeEventListener("change", sync);
    };
  }, [select]);

  const selectedIndex = options.findIndex((option) => option.value === selectedValue);
  const positionLabel = selectedIndex >= 0
    ? `${selectedIndex + 1}/${options.length}`
    : `${options.length}`;

  function handleTextChange(value: string) {
    setText(value);
    const normalized = normalizeSearch(value);

    if (!normalized) {
      if (select.value) changeNativeSelect(select, "");
      return;
    }

    const exactMatch = options.find((option) =>
      normalizeSearch(option.label) === normalized
      || normalizeSearch(option.value) === normalized,
    );

    if (exactMatch) {
      if (select.value !== exactMatch.value) changeNativeSelect(select, exactMatch.value);
    } else if (select.value) {
      changeNativeSelect(select, "");
    }
  }

  function restoreSelectedValue() {
    window.setTimeout(() => {
      const selected = select.options[select.selectedIndex];
      setText(select.value ? selected?.textContent?.trim() || select.value : "");
    }, 120);
  }

  function navigateClient(direction: -1 | 1) {
    if (!options.length) return;

    const nextIndex = selectedIndex < 0
      ? (direction === 1 ? 0 : options.length - 1)
      : (selectedIndex + direction + options.length) % options.length;
    const next = options[nextIndex];

    setText(next.label);
    changeNativeSelect(select, next.value);
    inputRef.current?.blur();
  }

  return (
    <div className="client-filter-navigation">
      <div className="client-search-control">
        <input
          ref={inputRef}
          type="search"
          list={listId}
          value={text}
          placeholder="Todos os clientes"
          aria-label="Buscar cliente"
          autoComplete="off"
          onChange={(event) => handleTextChange(event.target.value)}
          onBlur={restoreSelectedValue}
          onFocus={(event) => event.currentTarget.select()}
        />
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option.value} value={option.label} />
          ))}
        </datalist>
        {(text || select.value) && (
          <button
            type="button"
            className="client-search-clear"
            aria-label="Limpar cliente"
            title="Mostrar todos os clientes"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setText("");
              changeNativeSelect(select, "");
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        )}
        <span className="client-search-position" title={`${options.length} clientes disponíveis`}>
          {positionLabel}
        </span>
      </div>

      <div className="client-navigation-buttons" role="group" aria-label="Navegar entre clientes">
        <button
          type="button"
          aria-label="Cliente anterior"
          title="Cliente anterior"
          disabled={!options.length}
          onClick={() => navigateClient(-1)}
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          aria-label="Próximo cliente"
          title="Próximo cliente"
          disabled={!options.length}
          onClick={() => navigateClient(1)}
        >
          <ChevronDown size={14} />
        </button>
      </div>
    </div>
  );
}

export default function ClientFilterSearchEnhancer() {
  const [select, setSelect] = useState<HTMLSelectElement | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const locateFilter = () => {
      const nextSelect = document.querySelector<HTMLSelectElement>(".client-filter select");
      const nextTarget = nextSelect?.parentElement ?? null;
      setSelect((current) => current === nextSelect ? current : nextSelect);
      setTarget((current) => current === nextTarget ? current : nextTarget);
    };

    locateFilter();
    const observer = new MutationObserver(locateFilter);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style jsx global>{`
        .client-filter .select-wrap > select,
        .client-filter .select-wrap > svg {
          position: absolute !important;
          width: 1px !important;
          height: 1px !important;
          padding: 0 !important;
          margin: -1px !important;
          overflow: hidden !important;
          clip: rect(0, 0, 0, 0) !important;
          white-space: nowrap !important;
          border: 0 !important;
        }

        .client-filter .select-wrap {
          width: 275px;
        }

        .client-filter-navigation {
          width: 275px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 32px;
          gap: 5px;
          align-items: stretch;
        }

        .client-search-control {
          position: relative;
          min-width: 0;
        }

        .client-search-control input {
          width: 100%;
          height: 34px;
          padding: 0 67px 0 11px;
          color: #50596c;
          background: #f8f9fc;
          border: 1px solid #e6e9f0;
          border-radius: 8px;
          outline: none;
          font-size: 12px;
          font-weight: 600;
        }

        .client-search-control input:focus {
          border-color: #9aa8fb;
          box-shadow: 0 0 0 3px rgba(93, 114, 246, 0.12);
          background: #fff;
        }

        .client-search-control input::-webkit-search-cancel-button {
          display: none;
        }

        .client-search-clear {
          position: absolute;
          right: 34px;
          top: 50%;
          transform: translateY(-50%);
          width: 20px;
          height: 20px;
          display: grid;
          place-items: center;
          border: 0;
          background: transparent;
          color: #7e879b;
          font-size: 17px;
          line-height: 1;
        }

        .client-search-clear:hover {
          color: #1b2131;
          background: #eceff6;
          border-radius: 50%;
        }

        .client-search-position {
          position: absolute;
          right: 7px;
          top: 50%;
          transform: translateY(-50%);
          min-width: 25px;
          padding: 3px 4px;
          border-radius: 5px;
          color: #7d879b;
          background: #edf0f6;
          font-size: 8px;
          font-weight: 850;
          line-height: 1;
          text-align: center;
          pointer-events: none;
        }

        .client-navigation-buttons {
          display: grid;
          grid-template-rows: repeat(2, 1fr);
          gap: 2px;
        }

        .client-navigation-buttons button {
          min-width: 32px;
          padding: 0;
          display: grid;
          place-items: center;
          border: 1px solid #e2e6ef;
          border-radius: 6px;
          color: #697389;
          background: #f8f9fc;
          transition: 0.16s ease;
        }

        .client-navigation-buttons button:hover:not(:disabled) {
          color: #fff;
          border-color: #5d72f6;
          background: #5d72f6;
        }

        .client-navigation-buttons button:disabled {
          opacity: 0.38;
          cursor: not-allowed;
        }

        @media (max-width: 920px) {
          .filter-bar {
            flex-wrap: wrap;
          }

          .filter-heading {
            width: 100%;
          }
        }

        @media (max-width: 760px) {
          .client-filter,
          .client-filter .select-wrap,
          .client-filter-navigation {
            width: 100%;
          }
        }

        @media print {
          .client-filter-navigation {
            display: none !important;
          }
        }
      `}</style>
      {target && select ? createPortal(<ClientSearchControl select={select} />, target) : null}
    </>
  );
}
