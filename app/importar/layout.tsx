import type { ReactNode } from "react";
import SandboxAuthGate from "@/components/SandboxAuthGate";

export default function ImportLayout({ children }: { children: ReactNode }) {
  return <SandboxAuthGate>{children}</SandboxAuthGate>;
}
