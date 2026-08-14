export const COLOR_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "M"] as const;

export type ColorLetter = (typeof COLOR_LETTERS)[number];

export type BeadColor = {
  id: string;
  code: string;
  hex: string;
  letter: ColorLetter;
  sheet: "ABC" | "DEF" | "GHM";
};

export type ConsumptionItem = {
  colorId: string;
  quantity: number;
};

export type ConsumptionEntry = {
  id: string;
  items: ConsumptionItem[];
  note?: string;
  createdAt: string;
};

export type StockChangeItem = {
  colorId: string;
  quantity: number;
};

export type StockChangeEntry = {
  id: string;
  kind: "restock" | "correction";
  items: StockChangeItem[];
  note?: string;
  createdAt: string;
};

export type PatternUsage = {
  colorId: string;
  expectedQuantity: number;
  actualQuantity?: number;
};

export type Pattern = {
  id: string;
  name: string;
  status: "todo" | "done";
  imageDataUrl?: string;
  usages: PatternUsage[];
  note?: string;
  createdAt: string;
  completedAt?: string;
};

export type AppData = {
  version: 1;
  inventory: Record<string, number>;
  stockChanges: StockChangeEntry[];
  consumptions: ConsumptionEntry[];
  patterns: Pattern[];
  settings: {
    lowStockThreshold: number;
  };
};

export type AuthUser = {
  id: string;
  email: string;
  createdAt: string;
};

export type InventorySummary = {
  initial: number;
  restocked: number;
  adjusted: number;
  manualConsumed: number;
  patternConsumed: number;
  remaining: number;
};
