import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHistory,
  buildRows,
  buildWeeks,
  filterForecastRows,
  type ForecastRow,
} from "../components/ReceiptForecastEnhancerV13";
import type { Receipt } from "../lib/types";

function receipt(id: string, receiptDate: string, client: string, amount: number): Receipt {
  return {
    id,
    receiptDate,
    description: client,
    amount,
    bank: "Teste",
    sourceSheet: "RECEBIMENTOS",
    invoiceNumbers: [],
    clientHint: client,
  };
}

function recurringClient(client: string, day: number, amount: number) {
  return [5, 6, 7].map((month, index) =>
    receipt(`${client}-${index}`, `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, client, amount),
  );
}

function totals(rows: ForecastRow[], weekId = "all") {
  const filtered = weekId === "all" ? rows : rows.filter((row) => row.weekId === weekId);
  return {
    pending: filtered.filter((row) => row.status !== "Recebido").reduce((sum, row) => sum + row.remaining, 0),
    received: filtered.filter((row) => row.actual).reduce((sum, row) => sum + (row.actual?.total ?? 0), 0),
  };
}

const historicalReceipts = [
  ...recurringClient("Cliente Dia 02", 2, 50_000),
  ...recurringClient("Cliente Dia 03", 3, 10_000),
  ...recurringClient("Cliente Dia 10", 10, 20_000),
  ...recurringClient("Cliente Dia 17", 17, 30_000),
  ...recurringClient("Cliente Dia 24", 24, 40_000),
];

test("agosto/2026 cria cinco semanas completas pertencentes ao mês da segunda-feira", () => {
  const weeks = buildWeeks(new Date(2026, 7, 1, 12));
  assert.deepEqual(
    weeks.map((week) => [week.id, week.end.getFullYear(), week.end.getMonth() + 1, week.end.getDate(), week.ownerMonth]),
    [
      ["2026-08-03", 2026, 8, 7, "2026-08"],
      ["2026-08-10", 2026, 8, 14, "2026-08"],
      ["2026-08-17", 2026, 8, 21, "2026-08"],
      ["2026-08-24", 2026, 8, 28, "2026-08"],
      ["2026-08-31", 2026, 9, 4, "2026-08"],
    ],
  );
});

test("KPIs consolidados e semanais usam as mesmas linhas, incluindo 02/09 na semana 5", () => {
  const history = buildHistory(historicalReceipts, new Date(2026, 7, 1, 12));
  const weeks = buildWeeks(new Date(2026, 7, 1, 12));
  const rows = buildRows(historicalReceipts, history, weeks);

  assert.deepEqual(totals(rows), { pending: 210_000, received: 0 });
  assert.deepEqual(weeks.map((week) => totals(rows, week.id)), [
    { pending: 60_000, received: 0 },
    { pending: 20_000, received: 0 },
    { pending: 30_000, received: 0 },
    { pending: 40_000, received: 0 },
    { pending: 60_000, received: 0 },
  ]);
  assert.ok(rows.some((row) => row.weekId === "2026-08-31" && row.estimatedDate === "2026-09-02"));
});

test("recebimento real em 02/09 fecha o ciclo da semana 5 sem permanecer pendente", () => {
  const actual = receipt("actual-sep-02", "2026-09-02", "Cliente Dia 02", 25_000);
  const receipts = [...historicalReceipts, actual];
  const history = buildHistory(receipts, new Date(2026, 7, 1, 12));
  const weeks = buildWeeks(new Date(2026, 7, 1, 12));
  const rows = buildRows(receipts, history, weeks);

  assert.deepEqual(totals(rows), { pending: 160_000, received: 25_000 });
  assert.deepEqual(totals(rows, "2026-08-31"), { pending: 10_000, received: 25_000 });
  assert.equal(rows.filter((row) => row.weekId === "2026-08-31" && row.clientName === "Cliente Dia 02").length, 1);
  assert.equal(rows.find((row) => row.weekId === "2026-08-31" && row.clientName === "Cliente Dia 02")?.status, "Recebido");
});

test("setembro/2026 começa pela semana completa de 31/08 a 04/09", () => {
  const actual = receipt("actual-sep-02", "2026-09-02", "Cliente Dia 02", 25_000);
  const receipts = [...historicalReceipts, actual];
  const history = buildHistory(receipts, new Date(2026, 7, 1, 12));
  const weeks = buildWeeks(new Date(2026, 8, 1, 12));
  const rows = buildRows(receipts, history, weeks);

  assert.deepEqual(
    weeks.map((week) => [week.id, week.end.getFullYear(), week.end.getMonth() + 1, week.end.getDate(), week.ownerMonth]),
    [
      ["2026-08-31", 2026, 9, 4, "2026-09"],
      ["2026-09-07", 2026, 9, 11, "2026-09"],
      ["2026-09-14", 2026, 9, 18, "2026-09"],
      ["2026-09-21", 2026, 9, 25, "2026-09"],
      ["2026-09-28", 2026, 10, 2, "2026-09"],
    ],
  );
  assert.equal(rows.some((row) => row.actual?.dates.includes("2026-09-02")), true);
  assert.equal(totals(rows, "2026-08-31").received, 25_000);
});

test("semana, cliente, confiança e somente pendentes usam o mesmo filtro das linhas", () => {
  const actual = receipt("actual-sep-02", "2026-09-02", "Cliente Dia 02", 25_000);
  const receipts = [...historicalReceipts, actual];
  const history = buildHistory(receipts, new Date(2026, 7, 1, 12));
  const rows = buildRows(receipts, history, buildWeeks(new Date(2026, 7, 1, 12)));
  const filtered = filterForecastRows(rows, {
    selectedWeek: "2026-08-31",
    selectedClient: "CLIENTE DIA 03",
    selectedConfidence: "Alta",
    onlyPending: true,
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.estimatedDate, "2026-09-03");
  assert.deepEqual(totals(filtered), { pending: 10_000, received: 0 });
});
