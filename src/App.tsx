import { useEffect, useState } from "react";
import { BottomNav } from "./components";
import type { RootTab } from "./components";
import type { Screen } from "./navigation";
import { rootTabForScreen } from "./navigation";
import { useAppStore } from "./store";
import { AccountSettingsPage, AuthPage } from "./pages/AuthPages";
import {
  BatchInitialPage,
  ColorDetailPage,
  ConsumePage,
  RestockPage,
  WarehousePage,
} from "./pages/WarehousePages";
import {
  CompletePatternPage,
  PatternDetailPage,
  PatternFormPage,
  PatternsPage,
} from "./pages/PatternPages";
import { ConsumptionHistoryPage, StatsPage, StockHistoryPage } from "./pages/StatsPages";

const rootScreen = (tab: RootTab): Screen => ({ type: tab });

export default function App() {
  const { ready, user } = useAppStore();
  const [history, setHistory] = useState<Screen[]>([{ type: "warehouse" }]);
  const screen = history[history.length - 1];
  const navigate = (next: Screen) => setHistory((current) => [...current, next]);
  const back = () => setHistory((current) => current.length > 1 ? current.slice(0, -1) : current);
  const switchTab = (tab: RootTab) => setHistory([rootScreen(tab)]);

  useEffect(() => {
    setHistory([{ type: "warehouse" }]);
  }, [user?.id]);

  if (!ready) {
    return <div className="app-loading"><div className="loading-bead" /><span>正在整理豆仓</span></div>;
  }

  if (!user) {
    return (
      <div className="app-shell">
        <AuthPage />
      </div>
    );
  }

  const renderScreen = () => {
    switch (screen.type) {
      case "warehouse": return <WarehousePage navigate={navigate} />;
      case "batch-initial": return <BatchInitialPage back={back} />;
      case "consume": return <ConsumePage initialColorId={screen.initialColorId} back={back} />;
      case "restock": return <RestockPage initialColorId={screen.initialColorId} back={back} />;
      case "color-detail": return <ColorDetailPage colorId={screen.colorId} navigate={navigate} back={back} />;
      case "patterns": return <PatternsPage navigate={navigate} />;
      case "pattern-form": return <PatternFormPage patternId={screen.patternId} back={back} />;
      case "pattern-detail": return <PatternDetailPage patternId={screen.patternId} navigate={navigate} back={back} />;
      case "complete-pattern": return <CompletePatternPage patternId={screen.patternId} back={back} />;
      case "stats": return <StatsPage navigate={navigate} />;
      case "consumption-history": return <ConsumptionHistoryPage navigate={navigate} back={back} />;
      case "stock-history": return <StockHistoryPage navigate={navigate} back={back} />;
      case "account-settings": return <AccountSettingsPage back={back} />;
    }
  };

  const isRoot = ["warehouse", "patterns", "stats"].includes(screen.type);
  return (
    <div className="app-shell">
      {renderScreen()}
      {isRoot ? <BottomNav active={rootTabForScreen(screen)} onChange={switchTab} /> : null}
    </div>
  );
}
