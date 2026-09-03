export type Invoice = {
  id: string;
  emissionDate: string;
  invoiceNumber: string;
  titleNumber: string;
  grossValue: number;
  netValue: number;
  clientCode: string;
  clientName: string;
};

export type Receipt = {
  id: string;
  receiptDate: string;
  description: string;
  amount: number;
  bank: string;
  sourceSheet: string;
  invoiceNumbers: string[];
  clientHint: string;
};

export type OpenReceivable = {
  id: string;
  clientCode: string;
  clientName: string;
  invoiceNumber: string;
  titleNumber: string;
  emissionDate: string;
  dueDate: string;
  originalValue: number;
  openValue: number;
  status: string;
  sourceSheet: string;
  reportedOpenValue?: number;
  balanceIssue?: string;
};

export type ReceivableAllocationNature =
  | "payment"
  | "credit_adjustment"
  | "debit_adjustment"
  | "balance_snapshot"
  | "unclassified";

export type ReceivableAllocation = {
  id: string;
  receivableId: string;
  clientCode: string;
  clientName: string;
  invoiceNumber: string;
  titleNumber: string;
  effectiveDate: string;
  amount: number;
  sourceAmount: number;
  nature: ReceivableAllocationNature;
  description: string;
  sourceSheet: string;
  sourceRow: number;
};

export type ReceivableReconciliationIssue = {
  id: string;
  receivableId: string;
  severity: "warning" | "error";
  message: string;
};

export type ImportState = {
  invoices: Invoice[];
  receipts: Receipt[];
  openReceivables?: OpenReceivable[];
  receivableAllocations?: ReceivableAllocation[];
  receivableIssues?: ReceivableReconciliationIssue[];
  invoiceFileName?: string;
  receiptFileName?: string;
};

export type PeriodFilter = {
  year: number | "all";
  month: number | "all";
  client: string;
};
