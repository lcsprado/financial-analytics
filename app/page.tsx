import ClientFilterSearchEnhancer from "@/components/ClientFilterSearchEnhancer";
import FinancialDashboard from "@/components/FinancialDashboard";
import ForecastNavigationStateSync from "@/components/ForecastNavigationStateSync";
import InvoiceClientCodeNormalizer from "@/components/InvoiceClientCodeNormalizer";
import LegacyDirectorModeCleanup from "@/components/LegacyDirectorModeCleanup";
import PerformanceScopedEnhancers from "@/components/PerformanceScopedEnhancers";
import PrintButton from "@/components/PrintButton";
import ReceiptClientIdentityNormalizer from "@/components/ReceiptClientIdentityNormalizer";
import ReceiptForecastEnhancerV13 from "@/components/ReceiptForecastEnhancerV13";
import ReceiptForecastTableFitFix from "@/components/ReceiptForecastTableFitFix";
import ReportSourceLabels from "@/components/ReportSourceLabels";

export default function Home() {
  return (
    <>
      <LegacyDirectorModeCleanup />
      <PrintButton />
      <FinancialDashboard />
      <ForecastNavigationStateSync />
      <ReportSourceLabels />
      <ClientFilterSearchEnhancer />
      <InvoiceClientCodeNormalizer />
      <ReceiptClientIdentityNormalizer />
      <ReceiptForecastEnhancerV13 />
      <ReceiptForecastTableFitFix />
      <PerformanceScopedEnhancers />
    </>
  );
}
