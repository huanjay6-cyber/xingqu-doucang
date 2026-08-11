import type { AppData, InventorySummary, PatternUsage, StockChangeItem } from "../types";

export function usageQuantity(usage: PatternUsage) {
  return usage.actualQuantity ?? usage.expectedQuantity;
}

export function getColorSummary(data: AppData, colorId: string): InventorySummary {
  const initial = data.inventory[colorId] ?? 0;
  const stockChanges = data.stockChanges ?? [];
  const restocked = stockChanges.reduce(
    (total, entry) => total + (entry.kind === "restock"
      ? entry.items.reduce((sum, item) => sum + (item.colorId === colorId ? item.quantity : 0), 0)
      : 0),
    0,
  );
  const adjusted = stockChanges.reduce(
    (total, entry) => total + (entry.kind === "correction"
      ? entry.items.reduce((sum, item) => sum + (item.colorId === colorId ? item.quantity : 0), 0)
      : 0),
    0,
  );
  const manualConsumed = data.consumptions.reduce(
    (total, entry) =>
      total + entry.items.reduce((sum, item) => sum + (item.colorId === colorId ? item.quantity : 0), 0),
    0,
  );
  const patternConsumed = data.patterns.reduce(
    (total, pattern) =>
      total +
      (pattern.status === "done"
        ? pattern.usages.reduce(
            (sum, usage) => sum + (usage.colorId === colorId ? usageQuantity(usage) : 0),
            0,
          )
        : 0),
    0,
  );

  return {
    initial,
    restocked,
    adjusted,
    manualConsumed,
    patternConsumed,
    remaining: initial + restocked + adjusted - manualConsumed - patternConsumed,
  };
}

export function getInventorySummaries(data: AppData) {
  const colorIds = new Set<string>([
    ...Object.keys(data.inventory),
    ...(data.stockChanges ?? []).flatMap((entry) => entry.items.map((item) => item.colorId)),
    ...data.consumptions.flatMap((entry) => entry.items.map((item) => item.colorId)),
    ...data.patterns.flatMap((pattern) => pattern.usages.map((usage) => usage.colorId)),
  ]);

  return Object.fromEntries(
    [...colorIds].map((colorId) => [colorId, getColorSummary(data, colorId)]),
  );
}

export function getTotals(data: AppData): InventorySummary {
  const summaries = Object.values(getInventorySummaries(data));
  return summaries.reduce<InventorySummary>(
    (totals, summary) => ({
      initial: totals.initial + summary.initial,
      restocked: totals.restocked + summary.restocked,
      adjusted: totals.adjusted + summary.adjusted,
      manualConsumed: totals.manualConsumed + summary.manualConsumed,
      patternConsumed: totals.patternConsumed + summary.patternConsumed,
      remaining: totals.remaining + summary.remaining,
    }),
    { initial: 0, restocked: 0, adjusted: 0, manualConsumed: 0, patternConsumed: 0, remaining: 0 },
  );
}

export function getStocktakeItems(
  data: AppData,
  targets: Readonly<Record<string, number | "">>,
  colorIds: Iterable<string>,
): StockChangeItem[] {
  return [...colorIds]
    .map((colorId) => ({
      colorId,
      quantity: Number(targets[colorId] || 0) - getColorSummary(data, colorId).remaining,
    }))
    .filter((item) => item.quantity !== 0);
}

export function formatQuantity(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}
