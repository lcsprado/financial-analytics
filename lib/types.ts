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

export type ImportState = {
  invoices: Invoice[];
  receipts: Receipt[];
  invoiceFileName?: string;
  receiptFileName?: string;
};

export type PeriodFilter = {
  year: number | "all";
  month: number | "all";
  client: string;
};
