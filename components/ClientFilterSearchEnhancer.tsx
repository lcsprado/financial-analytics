"use client";

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
    const timer = window.setInterval(sync, 250);

    return () => {
      window.clearInterval(timer);
      optionObserver.disconnect();
      select.removeEventListener("change", sync);
    };
  }, [select]);

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

  return (
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
      {(text || select.value) ? (
        <button
          type="button"
          className="client-search-clear"
          aria-label="Limpar cliente"
          title="Limpar cliente"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setText("");
            changeNativeSelect(select, "");
            inputRef.current?.focus();
          }}
        >
          ×
        </button>
      ) : (
        <span className="client-search-chevron" aria-hidden="true">⌄</span>
      )}
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
          width: 235px;
        }

        .client-search-control {
          position: relative;
          width: 235px;
        }

        .client-search-control input {
          width: 100%;
          height: 34px;
          padding: 0 31px 0 11px;
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

        .client-search-clear,
        .client-search-chevron {
          position: absolute;
          right: 8px;
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

        .client-search-chevron {
          pointer-events: none;
          font-size: 15px;
        }

        .client-search-clear:hover {
          color: #1b2131;
          background: #eceff6;
          border-radius: 50%;
        }

        @media (max-width: 760px) {
          .client-filter .select-wrap,
          .client-search-control {
            width: 100%;
          }
        }

        @media print {
          .client-search-control {
            display: none !important;
          }
        }
      `}</style>
      {target && select ? createPortal(<ClientSearchControl select={select} />, target) : null}
    </>
  );
}
