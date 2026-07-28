import ClientFilterSearchEnhancer from "@/components/ClientFilterSearchEnhancer";
import DashboardVisualControls from "@/components/DashboardVisualControls";
import DirectorWorkbookEnhancerV3 from "@/components/DirectorWorkbookEnhancerV3";
import DirectorWorkbookIsolation from "@/components/DirectorWorkbookIsolation";
import EmptyStateImportRedirect from "@/components/EmptyStateImportRedirect";
import FinancialDashboard from "@/components/FinancialDashboard";
import InvoiceDateRangeFilter from "@/components/InvoiceDateRangeFilter";
import MonthlyVariationEnhancer from "@/components/MonthlyVariationEnhancer";
import PrintButton from "@/components/PrintButton";
import ReceiptDateRangeFilter from "@/components/ReceiptDateRangeFilter";

export default function Home() {
  return (
    <>
      <PrintButton />
      <FinancialDashboard />
      <EmptyStateImportRedirect />
      <ClientFilterSearchEnhancer />
      <DashboardVisualControls />
      <MonthlyVariationEnhancer />
      <DirectorWorkbookEnhancerV3 />
      <DirectorWorkbookIsolation />
      <InvoiceDateRangeFilter />
      <ReceiptDateRangeFilter />
    </>
  );
}
