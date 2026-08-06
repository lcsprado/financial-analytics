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
import ReceiptForecastEnhancerV12 from "@/components/ReceiptForecastEnhancerV12";
import ReportSourceLabels from "@/components/ReportSourceLabels";
import ScopedClientFilterEnhancer from "@/components/ScopedClientFilterEnhancer";

export default function Home() {
  return (
    <>
      <LegacyDirectorModeCleanup />
      <PrintButton />
      <FinancialDashboard />
      <ReportSourceLabels />
      <ClientFilterSearchEnhancer />
      <InvoiceClientCodeNormalizer />
      <ScopedClientFilterEnhancer />
      <ClientFilterInteractionFix />
      <DashboardKpiCleanup />
      <DashboardVisualControls />
      <MonthlyVariationEnhancer />
      <ReceiptClientsFallback />
      <InvoiceDateRangeFilter />
      <InvoiceAnalyticsEnhancer />
      <ReceiptDateRangeFilter />
      <ReceiptForecastEnhancerV12 />
    </>
  );
}
