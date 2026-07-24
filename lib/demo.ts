import type { Invoice, Receipt } from "./types";

const clients = [
  "Prefeitura Municipal Alfa",
  "Hospital Regional Vida",
  "Instituto Saúde Plena",
  "Fundação Bem-Estar",
  "Santa Casa Central",
  "Rede Municipal Esperança",
];

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function createDemoData(): { invoices: Invoice[]; receipts: Receipt[] } {
  const invoices: Invoice[] = [];
  const receipts: Receipt[] = [];
  let counter = 10000;

  for (let month = 1; month <= 12; month += 1) {
    clients.forEach((client, clientIndex) => {
      const count = 2 + ((month + clientIndex) % 4);
      for (let item = 0; item < count; item += 1) {
        counter += 1;
        const grossValue = 45000 + month * 7800 + clientIndex * 12500 + item * 3900;
        const invoiceNumber = String(counter);
        invoices.push({
          id: `demo-invoice-${counter}`,
          emissionDate: iso(2026, month, Math.min(3 + item * 5 + clientIndex, 27)),
          invoiceNumber,
          titleNumber: `T${counter}`,
          grossValue,
          netValue: grossValue * 0.941,
          clientCode: `C${String(clientIndex + 1).padStart(4, "0")}`,
          clientName: client,
        });
        if ((item + clientIndex + month) % 5 !== 0) {
          receipts.push({
            id: `demo-receipt-${counter}`,
            receiptDate: iso(2026, Math.min(month + 1, 12), Math.min(8 + item * 4, 27)),
            description: `${client} - NF ${invoiceNumber}`,
            amount: grossValue * (item % 3 === 0 ? 0.98 : 0.941),
            bank: ["BANCO DO BRASIL", "BRADESCO", "SANTANDER", "ITAÚ"][clientIndex % 4],
            sourceSheet: "DEMONSTRAÇÃO",
            invoiceNumbers: [invoiceNumber],
            clientHint: client,
          });
        }
      }
    });
  }
  return { invoices, receipts };
}
