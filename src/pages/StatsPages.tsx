import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Eraser, History, PackageOpen, PackagePlus, SlidersHorizontal, UserCog } from "lucide-react";
import { beadColors } from "../data/colors";
import { formatQuantity, getColorSummary, getInventorySummaries, getTotals } from "../lib/inventory";
import { useAppStore } from "../store";
import type { Screen } from "../navigation";
import {
  ConfirmDialog,
  EmptyState,
  PageBody,
  QuantityInput,
  RowLink,
  Swatch,
  TopBar,
} from "../components";

type NavigationProps = {
  navigate: (screen: Screen) => void;
  back: () => void;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function StatsPage({ navigate }: Pick<NavigationProps, "navigate">) {
  const { data, updateData, resetData } = useAppStore();
  const [showClear, setShowClear] = useState(false);
  const totals = useMemo(() => getTotals(data), [data]);
  const summaries = useMemo(() => getInventorySummaries(data), [data]);
  const lowColors = beadColors.filter((color) => {
    const summary = summaries[color.id];
    const hasActivity = summary && (summary.initial > 0 || summary.restocked !== 0 || summary.adjusted !== 0 || summary.manualConsumed > 0 || summary.patternConsumed > 0);
    return hasActivity && summary.remaining <= data.settings.lowStockThreshold;
  });

  return (
    <>
      <TopBar title="统计" />
      <PageBody>
        <section className="stats-hero">
          <span>当前总剩余</span>
          <strong>{formatQuantity(totals.remaining)}</strong>
          <div>
            <p><span>总初始</span><b>{formatQuantity(totals.initial)}</b></p>
            <p><span>累计补仓</span><b>+{formatQuantity(totals.restocked)}</b></p>
            <p><span>手动消耗</span><b>{formatQuantity(totals.manualConsumed)}</b></p>
            <p><span>图纸消耗</span><b>{formatQuantity(totals.patternConsumed)}</b></p>
          </div>
        </section>

        <section className="stats-section">
          <div className="section-heading"><h2>低库存颜色</h2><span>{lowColors.length} 色</span></div>
          {lowColors.length ? (
            <div className="low-stock-list">
              {lowColors.slice(0, 12).map((color) => (
                <button key={color.id} onClick={() => navigate({ type: "color-detail", colorId: color.id })}>
                  <Swatch color={color.hex} />
                  <strong>{color.code}</strong>
                  <span>剩余 {formatQuantity(summaries[color.id].remaining)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="inline-empty"><PackageOpen size={20} /><span>暂无低库存颜色</span></div>
          )}
        </section>

        <section className="stats-section settings-section">
          <h2>库存与设置</h2>
          <RowLink onClick={() => navigate({ type: "batch-initial" })}>
            <span className="row-link__label"><SlidersHorizontal size={19} />库存盘点</span>
          </RowLink>
          <label className="setting-row">
            <span><strong>低库存阈值</strong><small>仅统计已有库存或消耗记录的色号</small></span>
            <QuantityInput
              value={data.settings.lowStockThreshold}
              ariaLabel="低库存阈值"
              onChange={(value) => updateData((current) => ({
                ...current,
                settings: { ...current.settings, lowStockThreshold: Number(value || 0) },
              }))}
            />
          </label>
          <RowLink onClick={() => navigate({ type: "consumption-history" })}>
            <span className="row-link__label"><History size={19} />消耗历史</span>
          </RowLink>
          <RowLink onClick={() => navigate({ type: "stock-history" })}>
            <span className="row-link__label"><PackagePlus size={19} />补仓与调整记录</span>
          </RowLink>
          <RowLink onClick={() => navigate({ type: "account-settings" })}>
            <span className="row-link__label"><UserCog size={19} />账号设置</span>
          </RowLink>
          <button className="row-link row-link--danger" onClick={() => setShowClear(true)}>
            <span className="row-link__label"><Eraser size={19} />清空当前账号数据</span>
          </button>
        </section>
      </PageBody>
      {showClear ? (
        <ConfirmDialog
          title="清空全部数据？"
          description="当前账号下的库存、消耗记录、图纸和设置将被清空，内置的 221 个色号会保留。此操作无法恢复。"
          confirmLabel="确认清空"
          danger
          onCancel={() => setShowClear(false)}
          onConfirm={() => { void resetData(); setShowClear(false); }}
        />
      ) : null}
    </>
  );
}

export function StockHistoryPage({ back, navigate }: NavigationProps) {
  const { data } = useAppStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  const entries = data.stockChanges ?? [];
  return (
    <>
      <TopBar title="补仓与调整记录" onBack={back} />
      <PageBody>
        {entries.length ? (
          <div className="history-list">
            {entries.map((entry) => {
              const isOpen = expanded === entry.id;
              const total = entry.items.reduce((sum, item) => sum + item.quantity, 0);
              const label = entry.kind === "restock" ? (entry.note || "补仓") : (entry.note || "在仓数量调整");
              return (
                <section className="history-entry" key={entry.id}>
                  <button className="history-entry__summary" onClick={() => setExpanded(isOpen ? null : entry.id)}>
                    <div><strong>{label}</strong><small>{formatDateTime(entry.createdAt)}</small></div>
                    <span>{entry.items.length} 色 / {total > 0 ? "+" : ""}{formatQuantity(total)} 颗</span>
                    {isOpen ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
                  </button>
                  {isOpen ? (
                    <div className="history-entry__items">
                      {entry.items.map((item) => {
                        const color = beadColors.find((candidate) => candidate.id === item.colorId)!;
                        return (
                          <button key={item.colorId} onClick={() => navigate({ type: "color-detail", colorId: item.colorId })}>
                            <Swatch color={color.hex} />
                            <strong>{color.code}</strong>
                            <span className={item.quantity > 0 ? "is-positive" : ""}>{item.quantity > 0 ? "+" : ""}{formatQuantity(item.quantity)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="还没有补仓或调整记录"
            action={<button className="button button--primary" onClick={() => navigate({ type: "restock" })}>去补仓</button>}
          />
        )}
      </PageBody>
    </>
  );
}

export function ConsumptionHistoryPage({ back, navigate }: NavigationProps) {
  const { data } = useAppStore();
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <>
      <TopBar title="消耗历史" onBack={back} />
      <PageBody>
        {data.consumptions.length ? (
          <div className="history-list">
            {data.consumptions.map((entry) => {
              const isOpen = expanded === entry.id;
              const total = entry.items.reduce((sum, item) => sum + item.quantity, 0);
              return (
                <section className="history-entry" key={entry.id}>
                  <button className="history-entry__summary" onClick={() => setExpanded(isOpen ? null : entry.id)}>
                    <div><strong>{entry.note || "未填写备注"}</strong><small>{formatDateTime(entry.createdAt)}</small></div>
                    <span>{entry.items.length} 色 / {formatQuantity(total)} 颗</span>
                    {isOpen ? <ChevronUp size={19} /> : <ChevronDown size={19} />}
                  </button>
                  {isOpen ? (
                    <div className="history-entry__items">
                      {entry.items.map((item) => {
                        const color = beadColors.find((candidate) => candidate.id === item.colorId)!;
                        return (
                          <button key={item.colorId} onClick={() => navigate({ type: "color-detail", colorId: item.colorId })}>
                            <Swatch color={color.hex} />
                            <strong>{color.code}</strong>
                            <span>-{formatQuantity(item.quantity)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="还没有消耗记录"
            action={<button className="button button--primary" onClick={() => navigate({ type: "consume" })}>去记录消耗</button>}
          />
        )}
      </PageBody>
    </>
  );
}
