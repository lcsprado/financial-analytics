import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parseReceiptWorkbook } from "../lib/parsers";

test("percentuais de pagamentos parciais não são concatenados às NFs", async () => {
  const cases = [
    ["CLIENTE SANTOS - NF 10833 - 50%", ["10833"]],
    ["CLIENTE SANTOS - NF 537 - 50%", ["537"]],
    ["CLIENTE SANTOS - NF 539 - 12,5%", ["539"]],
    ["CLIENTE SANTOS - NF 10833 / 537 E 539 - 50%", ["10833", "537", "539"]],
    ["CLIENTE SANTOS - NOTAS 00123, 00456 PARCIAL", ["123", "456"]],
    ["CLIENTE SANTOS - NF 11.097 FINAL", ["11097"]],
  ] as const;
  const rows: unknown[][] = [["DATA", "BRADESCO", "VALOR", "DATA", "BANCO DO BRASIL", "VALOR"], [], [], ["", "RECEBIMENTOS"]];
  cases.forEach(([description]) => rows.push([46248, description, 114954.48]));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "AGOSTO 2026");
  const file = new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], "conciliacao.xlsx");
  const receipts = await parseReceiptWorkbook(file);
  assert.equal(receipts.length, cases.length);
  receipts.forEach((receipt, index) => {
    assert.deepEqual(receipt.invoiceNumbers, cases[index][1]);
    assert.equal(receipt.amount, 114954.48);
    assert.equal(receipt.receiptDate, "2026-08-14");
    assert.equal(receipt.bank, "BRADESCO");
  });
});

test("valores monetários são normalizados para centavos antes da soma", async () => {
  const rows: unknown[][] = [
    ["DATA", "BRADESCO", "VALOR", "DATA", "BANCO DO BRASIL", "VALOR"],
    [],
    [],
    ["", "RECEBIMENTOS"],
    [46248, "FUNDAÇÃO ABC | SÃO MATEUS - NF 521", 53519.22856],
    [46248, "FUNDAÇÃO ABC | SÃO MATEUS - NF 522", 4506.047245],
    [46248, "FUNDAÇÃO ABC | SÃO MATEUS - NF 523", 51542.30452],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "AGOSTO 2026");
  const file = new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], "conciliacao.xlsx");
  const receipts = await parseReceiptWorkbook(file);

  assert.deepEqual(receipts.map((receipt) => receipt.amount), [53519.23, 4506.05, 51542.3]);
  assert.equal(receipts.reduce((sum, receipt) => sum + receipt.amount, 0), 109567.58);
});
