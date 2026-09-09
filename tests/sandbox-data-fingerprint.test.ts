import assert from "node:assert/strict";
import test from "node:test";
import { dataFingerprint } from "../lib/sandboxDataFingerprint";
import type { ImportState } from "../lib/types";

const base: ImportState = {
  invoiceFileName: "finr020.xlsx", receiptFileName: "conciliacao.xlsx",
  invoices: [{id:"nf-1",emissionDate:"2026-08-01",invoiceNumber:"10833",titleNumber:"1",grossValue:100,netValue:90,clientCode:"C1",clientName:"Cliente"}],
  receipts: [{id:"r-1",receiptDate:"2026-08-14",amount:45,bank:"BB",description:"Cliente - NF 10833 - 50%",sourceSheet:"AGOSTO 2026",invoiceNumbers:["1083350"],clientHint:"Cliente"}],
};

test("reimportação com NF corrigida deve ser sincronizada mesmo sem alterar valores", () => {
  const corrected = structuredClone(base);
  corrected.receipts[0].invoiceNumbers = ["10833"];
  assert.notEqual(dataFingerprint(base), dataFingerprint(corrected));
  assert.equal(dataFingerprint(corrected), dataFingerprint(structuredClone(corrected)));
});

test("correções de identificação do cliente e título também devem ser sincronizadas", () => {
  for (const change of [
    (data: ImportState) => { data.invoices[0].titleNumber = "2"; },
    (data: ImportState) => { data.invoices[0].clientCode = "C2"; },
    (data: ImportState) => { data.receipts[0].clientHint = "Cliente corrigido"; },
  ]) {
    const corrected = structuredClone(base);
    change(corrected);
    assert.notEqual(dataFingerprint(base), dataFingerprint(corrected));
  }
});
