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
};

export type ImportState = {
  invoices: Invoice[];
  receipts: Receipt[];
  openReceivables?: OpenReceivable[];
  invoiceFileName?: string;
  receiptFileName?: string;
};

export type PeriodFilter = {
  year: number | "all";
  month: number | "all";
  client: string;
};
