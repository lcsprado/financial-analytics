import ClientFilterSearchEnhancer from "@/components/ClientFilterSearchEnhancer";
import DashboardKpiCleanup from "@/components/DashboardKpiCleanup";
import DashboardVisualControls from "@/components/DashboardVisualControls";
import EmptyStateImportRedirect from "@/components/EmptyStateImportRedirect";
import FinancialDashboard from "@/components/FinancialDashboard";
import InvoiceDateRangeFilter from "@/components/InvoiceDateRangeFilter";
import LegacyDirectorModeCleanup from "@/components/LegacyDirectorModeCleanup";
import MonthlyVariationEnhancer from "@/components/MonthlyVariationEnhancer";
import PrintButton from "@/components/PrintButton";
import ReceiptClientsFallback from "@/components/ReceiptClientsFallback";
import ReceiptDateRangeFilter from "@/components/ReceiptDateRangeFilter";
import ReportSourceLabels from "@/components/ReportSourceLabels";
import ScopedClientFilterEnhancer from "@/components/ScopedClientFilterEnhancer";

export default function Home() {
  return (
    <>
      <LegacyDirectorModeCleanup />
      <PrintButton />
      <FinancialDashboard />
      <ReportSourceLabels />
      <EmptyStateImportRedirect />
      <ClientFilterSearchEnhancer />
      <ScopedClientFilterEnhancer />
      <DashboardKpiCleanup />
      <DashboardVisualControls />
      <MonthlyVariationEnhancer />
      <ReceiptClientsFallback />
      <InvoiceDateRangeFilter />
      <ReceiptDateRangeFilter />
    </>
  );
}
