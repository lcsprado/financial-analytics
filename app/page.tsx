import ClientFilterSearchEnhancer from "@/components/ClientFilterSearchEnhancer";
import FinancialDashboard from "@/components/FinancialDashboard";
import InvoiceClientCodeNormalizer from "@/components/InvoiceClientCodeNormalizer";
import LegacyDirectorModeCleanup from "@/components/LegacyDirectorModeCleanup";
import PerformanceScopedEnhancers from "@/components/PerformanceScopedEnhancers";
import PrintButton from "@/components/PrintButton";
import ReceiptClientIdentityNormalizer from "@/components/ReceiptClientIdentityNormalizer";
import ReceiptForecastEnhancerV13 from "@/components/ReceiptForecastEnhancerV13";
import ReportSourceLabels from "@/components/ReportSourceLabels";
import SandboxAnalyticsReady from "@/components/SandboxAnalyticsReady";
import SandboxAuthGate from "@/components/SandboxAuthGate";
import SandboxChannelRestore from "@/components/SandboxChannelRestore";
import SandboxMobileMode from "@/components/SandboxMobileMode";
import SandboxMobilePolish from "@/components/SandboxMobilePolish";

export default function Home() {
  return (
    <SandboxAuthGate>
      <SandboxAnalyticsReady>
        <SandboxChannelRestore />
        <SandboxMobileMode />
        <LegacyDirectorModeCleanup />
        <PrintButton />
        <FinancialDashboard />
        <ReportSourceLabels />
        <ClientFilterSearchEnhancer />
        <InvoiceClientCodeNormalizer />
        <ReceiptClientIdentityNormalizer />
        <ReceiptForecastEnhancerV13 />
        <PerformanceScopedEnhancers />
        <SandboxMobilePolish />
      </SandboxAnalyticsReady>
    </SandboxAuthGate>
  );
}
