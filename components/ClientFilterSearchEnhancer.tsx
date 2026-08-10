"use client";

/**
 * O filtro de clientes atual é renderizado pelo ScopedClientFilterEnhancerV2.
 * Este componente mantém somente o CSS que esconde o select nativo, sem
 * MutationObserver, timers ou uma segunda interface de filtro rodando oculta.
 */
export default function ClientFilterSearchEnhancer() {
  return (
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
        overflow: visible !important;
      }

      @media print {
        .multi-client-navigation {
          display: none !important;
        }
      }
    `}</style>
  );
}
