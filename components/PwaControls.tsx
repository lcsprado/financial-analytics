"use client";

import { useEffect, useState } from "react";
import {
  clearOfflineData,
  hasStorageConsent,
  setStorageConsent,
  STORAGE_CONSENT_EVENT,
} from "@/lib/offlineStorage";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function standaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

export default function PwaControls() {
  const [online, setOnline] = useState(true);
  const [backOnline, setBackOnline] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null);
  const [consented, setConsented] = useState(false);
  const [message, setMessage] = useState("");
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setBackOnline(false);
      setOnline(false);
    };
    const handleOnline = () => {
      setOnline(true);
      setBackOnline(true);
      window.setTimeout(() => setBackOnline(false), 4500);
    };
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setMenuOpen(false);
    };
    const handleConsent = () => setConsented(hasStorageConsent());

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener(STORAGE_CONSENT_EVENT, handleConsent);
    const browserStateTimer = window.setTimeout(() => {
      setOnline(navigator.onLine);
      setInstalled(standaloneMode());
      setConsented(hasStorageConsent());
      setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    }, 0);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }).then((registration) => {
        if (registration.waiting) setUpdateWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateWorker(worker);
            }
          });
        });
        void registration.update();
      }).catch(() => setMessage("Não foi possível ativar o modo aplicativo neste navegador."));

      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    }

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener(STORAGE_CONSENT_EVENT, handleConsent);
      window.clearTimeout(browserStateTimer);
    };
  }, []);

  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallPrompt(null);
    } else if (isIos) {
      setMessage("No iPhone, toque em Compartilhar e depois em “Adicionar à Tela de Início”.");
    }
  }

  async function toggleStorage(next: boolean) {
    setStorageConsent(next);
    setConsented(next);
    if (!next) {
      await clearOfflineData();
      setMessage("Planilhas e análises removidas deste dispositivo.");
    } else {
      setMessage("A recuperação da análise foi ativada por 30 dias.");
    }
  }

  async function clearData() {
    await clearOfflineData();
    setMessage("Planilhas e análises removidas deste dispositivo.");
  }

  const installAvailable = !installed && (Boolean(installPrompt) || isIos);

  return (
    <>
      {!online && <div className="connection-notice is-offline" role="status">Sem internet — modo offline</div>}
      {backOnline && <div className="connection-notice is-online" role="status">Conexão restabelecida</div>}
      {updateWorker && (
        <div className="update-notice" role="status">
          <span>Nova versão disponível.</span>
          <button type="button" onClick={() => updateWorker.postMessage({ type: "SKIP_WAITING" })}>Atualizar</button>
        </div>
      )}
      <div className="pwa-controls">
        <button
          type="button"
          className="pwa-menu-button"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((current) => !current)}
        >
          Aplicativo
        </button>
        {menuOpen && (
          <section className="pwa-menu" aria-label="Opções do aplicativo">
            <div>
              <strong>Financial Analytics no dispositivo</strong>
              <small>Instalação, dados offline e atualizações.</small>
            </div>
            {installAvailable && (
              <button type="button" className="pwa-primary-action" onClick={install}>
                {isIos && !installPrompt ? "Como instalar no iPhone" : "Instalar aplicativo"}
              </button>
            )}
            {installed && <span className="pwa-installed">Aplicativo instalado</span>}
            <label className="pwa-storage-option">
              <input
                type="checkbox"
                checked={consented}
                onChange={(event) => void toggleStorage(event.target.checked)}
              />
              <span>
                <b>Recuperar última análise</b>
                <small>Guarda planilhas, dados processados e filtros por até 30 dias.</small>
              </span>
            </label>
            <button type="button" className="pwa-clear-action" onClick={() => void clearData()}>
              Apagar dados deste dispositivo
            </button>
            {message && <p className="pwa-message" role="status">{message}</p>}
          </section>
        )}
      </div>
    </>
  );
}
