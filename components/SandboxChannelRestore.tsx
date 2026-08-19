"use client";

import { useEffect } from "react";
import {
  getValidSandboxSession,
  loadCurrentSandboxSnapshot,
} from "@/lib/dashboardSandbox";
import {
  CHANNEL_DATA_EVENT,
  saveChannelPayload,
} from "@/lib/offlineStorage";

export default function SandboxChannelRestore() {
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const session = await getValidSandboxSession();
        if (!active || !session) return;

        const snapshot = await loadCurrentSandboxSnapshot(session);
        const entries = Array.isArray(snapshot?.receipt_channels)
          ? snapshot.receipt_channels
          : [];

        if (!active || !entries.length) return;

        await saveChannelPayload({
          fileName: snapshot?.receipt_file_name ?? "Base compartilhada",
          entries,
        });

        if (!active) return;
        window.dispatchEvent(new Event(CHANNEL_DATA_EVENT));
      } catch {
        // A base principal continua funcionando mesmo se a restauração do canal falhar.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return null;
}
