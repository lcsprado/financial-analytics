import ClientFilterSearchEnhancer from "@/components/ClientFilterSearchEnhancer";
import FinancialDashboard from "@/components/FinancialDashboard";
import ForecastNavigationStateSync from "@/components/ForecastNavigationStateSync";
import HideOverviewClientFilter from "@/components/HideOverviewClientFilter";
import InvoiceClientCodeNormalizer from "@/components/InvoiceClientCodeNormalizer";
import LegacyDirectorModeCleanup from "@/components/LegacyDirectorModeCleanup";
import PerformanceScopedEnhancers from "@/components/PerformanceScopedEnhancers";
import PrintButton from "@/components/PrintButton";
import ReceiptClientIdentityNormalizer from "@/components/ReceiptClientIdentityNormalizer";
import ReceiptClientLinkFineControls from "@/components/ReceiptClientLinkFineControls";
import ReceiptExcelExportEnhancer from "@/components/ReceiptExcelExportEnhancer";
import ReceiptForecastEnhancerV13 from "@/components/ReceiptForecastEnhancerV13";
import ReceiptForecastTableFitFix from "@/components/ReceiptForecastTableFitFix";
import ReportSourceLabels from "@/components/ReportSourceLabels";
import SandboxAnalyticsReady from "@/components/SandboxAnalyticsReady";
import SandboxAuthGate from "@/components/SandboxAuthGate";
import SandboxChannelRestore from "@/components/SandboxChannelRestore";
import SandboxMobileKpiFit from "@/components/SandboxMobileKpiFit";
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
        <ForecastNavigationStateSync />
        <HideOverviewClientFilter />
        <ReceiptExcelExportEnhancer />
        <ReceiptClientLinkFineControls />
        <ReportSourceLabels />
        <ClientFilterSearchEnhancer />
        <InvoiceClientCodeNormalizer />
        <ReceiptClientIdentityNormalizer />
        <ReceiptForecastEnhancerV13 />
        <ReceiptForecastTableFitFix />
        <PerformanceScopedEnhancers />
        <SandboxMobilePolish />
        <SandboxMobileKpiFit />
      </SandboxAnalyticsReady>
    </SandboxAuthGate>
  );
}
