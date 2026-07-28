import ClientFilterSearchEnhancer from "@/components/ClientFilterSearchEnhancer";
import DashboardVisualControls from "@/components/DashboardVisualControls";
import EmptyStateImportRedirect from "@/components/EmptyStateImportRedirect";
import FinancialDashboard from "@/components/FinancialDashboard";
import InvoiceDateRangeFilter from "@/components/InvoiceDateRangeFilter";
import LegacyDirectorModeCleanup from "@/components/LegacyDirectorModeCleanup";
import MonthlyVariationEnhancer from "@/components/MonthlyVariationEnhancer";
import PrintButton from "@/components/PrintButton";
import ReceiptDateRangeFilter from "@/components/ReceiptDateRangeFilter";

export default function Home() {
  return (
    <>
      <LegacyDirectorModeCleanup />
      <PrintButton />
      <FinancialDashboard />
      <EmptyStateImportRedirect />
      <ClientFilterSearchEnhancer />
      <DashboardVisualControls />
      <MonthlyVariationEnhancer />
      <InvoiceDateRangeFilter />
      <ReceiptDateRangeFilter />
    </>
  );
}
