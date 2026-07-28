import ClientFilterSearchEnhancer from "@/components/ClientFilterSearchEnhancer";
import DashboardVisualControls from "@/components/DashboardVisualControls";
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
      <ClientFilterSearchEnhancer />
      <DashboardVisualControls />
      <MonthlyVariationEnhancer />
      <InvoiceDateRangeFilter />
      <ReceiptDateRangeFilter />
    </>
  );
}
