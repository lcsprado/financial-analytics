import ClientFilterInteractionFix from "@/components/ClientFilterInteractionFix";
import ClientFilterSearchEnhancer from "@/components/ClientFilterSearchEnhancer";
import DashboardKpiCleanup from "@/components/DashboardKpiCleanup";
import DashboardVisualControls from "@/components/DashboardVisualControls";
import FinancialDashboard from "@/components/FinancialDashboard";
import InvoiceAnalyticsEnhancer from "@/components/InvoiceAnalyticsEnhancer";
import InvoiceClientCodeNormalizer from "@/components/InvoiceClientCodeNormalizer";
import InvoiceDateRangeFilter from "@/components/InvoiceDateRangeFilter";
import LegacyDirectorModeCleanup from "@/components/LegacyDirectorModeCleanup";
import MonthlyVariationEnhancer from "@/components/MonthlyVariationEnhancer";
import PrintButton from "@/components/PrintButton";
import ReceiptClientsFallback from "@/components/ReceiptClientsFallback";
import ReceiptDateRangeFilter from "@/components/ReceiptDateRangeFilter";
import ReceiptForecastEnhancerV13 from "@/components/ReceiptForecastEnhancerV13";
import ReceiptForecastReceivedRuleFix from "@/components/ReceiptForecastReceivedRuleFix";
import ReportSourceLabels from "@/components/ReportSourceLabels";
import ScopedClientFilterEnhancerV2 from "@/components/ScopedClientFilterEnhancerV2";

export default function Home() {
  return (
    <>
      <LegacyDirectorModeCleanup />
      <PrintButton />
      <FinancialDashboard />
      <ReportSourceLabels />
      <ClientFilterSearchEnhancer />
      <InvoiceClientCodeNormalizer />
      <ScopedClientFilterEnhancerV2 />
      <ClientFilterInteractionFix />
      <DashboardKpiCleanup />
      <DashboardVisualControls />
      <MonthlyVariationEnhancer />
      <ReceiptClientsFallback />
      <InvoiceDateRangeFilter />
      <InvoiceAnalyticsEnhancer />
      <ReceiptDateRangeFilter />
      <ReceiptForecastEnhancerV13 />
      <ReceiptForecastReceivedRuleFix />
    </>
  );
}
