import type { RootTab } from "./components";

export type Screen =
  | { type: "warehouse" }
  | { type: "batch-initial" }
  | { type: "consume"; initialColorId?: string }
  | { type: "restock"; initialColorId?: string }
  | { type: "color-detail"; colorId: string }
  | { type: "patterns" }
  | { type: "pattern-form"; patternId?: string }
  | { type: "pattern-detail"; patternId: string }
  | { type: "complete-pattern"; patternId: string }
  | { type: "stats" }
  | { type: "consumption-history" }
  | { type: "stock-history" }
  | { type: "account-settings" };

export function rootTabForScreen(screen: Screen): RootTab {
  if (["patterns", "pattern-form", "pattern-detail", "complete-pattern"].includes(screen.type)) {
    return "patterns";
  }
  if (["stats", "consumption-history", "stock-history", "account-settings"].includes(screen.type)) return "stats";
  return "warehouse";
}
