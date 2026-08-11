import { describe, expect, it } from "vitest";
import type { AppData } from "../types";
import { getColorSummary, getStocktakeItems, getTotals } from "./inventory";

const data: AppData = {
  version: 1,
  inventory: { A1: 1000, A2: 500 },
  stockChanges: [
    {
      id: "restock-1",
      kind: "restock",
      createdAt: "2026-08-04T00:00:00.000Z",
      items: [
        { colorId: "A1", quantity: 200 },
        { colorId: "A2", quantity: 50 },
      ],
    },
    {
      id: "correction-1",
      kind: "correction",
      createdAt: "2026-08-04T00:00:00.000Z",
      items: [{ colorId: "A1", quantity: -10 }],
    },
  ],
  consumptions: [
    {
      id: "consume-1",
      createdAt: "2026-08-04T00:00:00.000Z",
      items: [
        { colorId: "A1", quantity: 80 },
        { colorId: "A2", quantity: 20 },
      ],
    },
  ],
  patterns: [
    {
      id: "todo-pattern",
      name: "待拼",
      status: "todo",
      createdAt: "2026-08-04T00:00:00.000Z",
      usages: [{ colorId: "A1", expectedQuantity: 200 }],
    },
    {
      id: "done-pattern",
      name: "已拼",
      status: "done",
      createdAt: "2026-08-04T00:00:00.000Z",
      completedAt: "2026-08-04T00:00:00.000Z",
      usages: [
        { colorId: "A1", expectedQuantity: 120, actualQuantity: 110 },
        { colorId: "A2", expectedQuantity: 30 },
      ],
    },
  ],
  settings: { lowStockThreshold: 50 },
};

describe("库存计算", () => {
  it("待拼预计用量不扣库存，已拼使用实际用量", () => {
    expect(getColorSummary(data, "A1")).toEqual({
      initial: 1000,
      restocked: 200,
      adjusted: -10,
      manualConsumed: 80,
      patternConsumed: 110,
      remaining: 1000,
    });
  });

  it("已拼实际用量为空时使用预计用量", () => {
    expect(getColorSummary(data, "A2").patternConsumed).toBe(30);
    expect(getColorSummary(data, "A2").remaining).toBe(500);
  });

  it("正确汇总所有库存", () => {
    expect(getTotals(data)).toEqual({
      initial: 1500,
      restocked: 250,
      adjusted: -10,
      manualConsumed: 100,
      patternConsumed: 140,
      remaining: 1500,
    });
  });

  it("库存盘点只生成目标在仓数量与当前剩余的差额", () => {
    expect(getStocktakeItems(data, { A1: 900, A2: 500, H2: 200 }, ["A1", "A2", "H2"])).toEqual([
      { colorId: "A1", quantity: -100 },
      { colorId: "H2", quantity: 200 },
    ]);
  });
});
