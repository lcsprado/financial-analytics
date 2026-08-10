import ClientFilterInteractionFix from "@/components/ClientFilterInteractionFix";
import ClientFilterSearchEnhancer from "@/components/ClientFilterSearchEnhancer";
import DashboardKpiCleanup from "@/components/DashboardKpiCleanup";
import DashboardVisualControls from "@/components/DashboardVisualControls";
import DashboardVisualPolishV1 from "@/components/DashboardVisualPolishV1";
import FinancialDashboard from "@/components/FinancialDashboard";
import InvoiceAnalyticsEnhancer from "@/components/InvoiceAnalyticsEnhancer";
import InvoiceClientCodeNormalizer from "@/components/InvoiceClientCodeNormalizer";
import InvoiceDateRangeFilter from "@/components/InvoiceDateRangeFilter";
import LegacyDirectorModeCleanup from "@/components/LegacyDirectorModeCleanup";
import MonthlyVariationEnhancer from "@/components/MonthlyVariationEnhancer";
import PrintButton from "@/components/PrintButton";
import ReceiptClientsFallback from "@/components/ReceiptClientsFallback";
import ReceiptDateRangeFilter from "@/components/ReceiptDateRangeFilter";
import ReceiptForecastComparativeCleanup from "@/components/ReceiptForecastComparativeCleanup";
import ReceiptForecastEnhancerV13 from "@/components/ReceiptForecastEnhancerV13";
import ReceiptForecastReceivedRuleFix from "@/components/ReceiptForecastReceivedRuleFix";
import ReceiptForecastWeekCardsPolishV15 from "@/components/ReceiptForecastWeekCardsPolishV15";
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
      <ReceiptForecastComparativeCleanup />
      <ReceiptForecastWeekCardsPolishV15 />
      <DashboardVisualPolishV1 />
    </>
  );
}
