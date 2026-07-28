import ClientFilterSearchEnhancer from "@/components/ClientFilterSearchEnhancer";
import DashboardVisualControls from "@/components/DashboardVisualControls";
import FinancialDashboard from "@/components/FinancialDashboard";
import InvoiceDateRangeFilter from "@/components/InvoiceDateRangeFilter";
import PrintButton from "@/components/PrintButton";
import ReceiptDateRangeFilter from "@/components/ReceiptDateRangeFilter";

export default function Home() {
  return (
    <>
      <PrintButton />
      <FinancialDashboard />
      <ClientFilterSearchEnhancer />
      <DashboardVisualControls />
      <InvoiceDateRangeFilter />
      <ReceiptDateRangeFilter />
    </>
  );
}
