import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MinusCircle, PackageOpen, PackagePlus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { beadColors } from "../data/colors";
import { COLOR_LETTERS } from "../types";
import type { BeadColor, ColorLetter, ConsumptionItem, StockChangeItem } from "../types";
import { formatQuantity, getColorSummary, getInventorySummaries, getStocktakeItems, getTotals } from "../lib/inventory";
import { useAppStore } from "../store";
import type { Screen } from "../navigation";
import {
  ConfirmDialog,
  EmptyState,
  PageBody,
  QuantityInput,
  SearchField,
  Swatch,
  TopBar,
} from "../components";

type NavigationProps = {
  navigate: (screen: Screen) => void;
  back: () => void;
};

function matchesColor(color: BeadColor, search: string) {
  return color.code.toLowerCase().includes(search.trim().toLowerCase());
}

function LetterMultiSelect({
  selected,
  onToggle,
}: {
  selected: ReadonlySet<string>;
  onToggle: (letter: ColorLetter) => void;
}) {
  return (
    <div className="letter-multi-select" aria-label="按字母批量选择">
      {COLOR_LETTERS.map((letter) => {
        const colorIds = beadColors.filter((color) => color.letter === letter).map((color) => color.id);
        const allSelected = colorIds.every((colorId) => selected.has(colorId));
        return (
          <button
            type="button"
            key={letter}
            className={allSelected ? "is-active" : ""}
            aria-label={`${allSelected ? "取消" : "选择"} ${letter} 组全部色号`}
            aria-pressed={allSelected}
            onClick={() => onToggle(letter)}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}

export function WarehousePage({ navigate }: Pick<NavigationProps, "navigate">) {
  const { data } = useAppStore();
  const [search, setSearch] = useState("");
  const [activeLetter, setActiveLetter] = useState<ColorLetter>("A");
  const groupRefs = useRef<Partial<Record<ColorLetter, HTMLElement | null>>>({});
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const summaries = useMemo(() => getInventorySummaries(data), [data]);
  const totals = useMemo(() => getTotals(data), [data]);
  const filtered = useMemo(() => beadColors.filter((color) => matchesColor(color, search)), [search]);
  const isInventoryUninitialized = Object.keys(data.inventory).length === 0
    && totals.restocked === 0
    && totals.adjusted === 0
    && totals.manualConsumed === 0
    && totals.patternConsumed === 0;
  const lowStockCount = beadColors.filter((color) => {
    const summary = summaries[color.id];
    const hasActivity = summary && (summary.initial > 0 || summary.restocked !== 0 || summary.adjusted !== 0 || summary.manualConsumed > 0 || summary.patternConsumed > 0);
    return hasActivity && summary.remaining <= data.settings.lowStockThreshold;
  }).length;

  useEffect(() => {
    const onScroll = () => {
      let current: ColorLetter = "A";
      COLOR_LETTERS.forEach((letter) => {
        const element = groupRefs.current[letter];
        if (element && element.getBoundingClientRect().top <= 180) current = letter;
      });
      setActiveLetter(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const jumpToLetter = (letter: ColorLetter) => {
    setActiveLetter(letter);
    groupRefs.current[letter]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const indexPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(0.999, (event.clientY - rect.top) / rect.height));
    jumpToLetter(COLOR_LETTERS[Math.floor(ratio * COLOR_LETTERS.length)]);
  };

  const startLongPress = (colorId: string) => {
    longPressed.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      navigate({ type: "consume", initialColorId: colorId });
    }, 520);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
  };

  return (
    <>
      <TopBar
        title="兴趣豆仓"
        actions={
          <>
            <button
              className="icon-button"
              onClick={() => navigate({ type: "restock" })}
              aria-label="补仓"
              title="补仓"
            >
              <PackagePlus size={21} />
            </button>
            <button
              className="icon-button"
              onClick={() => navigate({ type: "consume" })}
              aria-label="记录消耗"
              title="记录消耗"
            >
              <MinusCircle size={21} />
            </button>
          </>
        }
      />
      <PageBody className="warehouse-page">
        <div className="sticky-tools">
          <SearchField value={search} onChange={setSearch} />
          <div className="inventory-overview">
            <div><span>总剩余</span><strong>{formatQuantity(totals.remaining)}</strong></div>
            <div><span>低库存</span><strong className="accent-number">{lowStockCount} 色</strong></div>
          </div>
        </div>

        {isInventoryUninitialized && !search ? (
          <section className="inventory-onboarding">
            <div>
              <strong>还没有设置库存</strong>
              <span>先录入各色号当前拥有的数量</span>
            </div>
            <button className="button button--primary" onClick={() => navigate({ type: "batch-initial" })}>
              <SlidersHorizontal size={18} />初始化库存
            </button>
          </section>
        ) : null}

        {filtered.length ? (
          <div className="color-groups">
            {COLOR_LETTERS.map((letter) => {
              const colors = filtered.filter((color) => color.letter === letter);
              if (!colors.length) return null;
              return (
                <section
                  className="color-group"
                  key={letter}
                  ref={(element) => {
                    groupRefs.current[letter] = element;
                  }}
                >
                  <h2>{letter}</h2>
                  <div className="color-grid">
                    {colors.map((color) => {
                      const remaining = summaries[color.id]?.remaining ?? 0;
                      const summary = summaries[color.id];
                      const hasActivity = summary && (summary.initial > 0 || summary.restocked !== 0 || summary.adjusted !== 0 || summary.manualConsumed > 0 || summary.patternConsumed > 0);
                      const isLow = Boolean(hasActivity && remaining <= data.settings.lowStockThreshold);
                      return (
                        <button
                          className="color-card"
                          key={color.id}
                          onPointerDown={() => startLongPress(color.id)}
                          onPointerUp={cancelLongPress}
                          onPointerCancel={cancelLongPress}
                          onPointerLeave={cancelLongPress}
                          onContextMenu={(event) => event.preventDefault()}
                          onClick={() => {
                            if (!longPressed.current) navigate({ type: "color-detail", colorId: color.id });
                          }}
                        >
                          <span className="color-card__swatch" style={{ backgroundColor: color.hex }} />
                          <span className="color-card__meta">
                            <strong>{color.code}</strong>
                            <small className={isLow ? "is-low" : ""}>余 {formatQuantity(remaining)}</small>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <EmptyState title="没有找到这个色号" />
        )}

        {!search ? (
          <div
            className="letter-index"
            aria-label="色号快速索引"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              indexPointer(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) indexPointer(event);
            }}
          >
            {COLOR_LETTERS.map((letter) => (
              <button
                key={letter}
                className={activeLetter === letter ? "is-active" : ""}
                onClick={() => jumpToLetter(letter)}
              >
                {letter}
              </button>
            ))}
          </div>
        ) : null}
      </PageBody>
    </>
  );
}

export function ColorDetailPage({ colorId, navigate, back }: NavigationProps & { colorId: string }) {
  const { data, updateData } = useAppStore();
  const color = beadColors.find((item) => item.id === colorId)!;
  const summary = getColorSummary(data, colorId);
  const [targetRemaining, setTargetRemaining] = useState<number | "">(Math.max(0, summary.remaining));
  const [saved, setSaved] = useState(false);

  const saveRemaining = () => {
    if (targetRemaining === "") return;
    const quantity = Number(targetRemaining);
    const delta = quantity - summary.remaining;
    if (!delta) {
      setSaved(true);
      return;
    }
    updateData((current) => ({
      ...current,
      stockChanges: [
        {
          id: crypto.randomUUID(),
          kind: "correction",
          items: [{ colorId, quantity: delta }],
          note: `在仓数量由 ${summary.remaining} 调整为 ${quantity}`,
          createdAt: new Date().toISOString(),
        },
        ...(current.stockChanges ?? []),
      ],
    }));
    setSaved(true);
  };

  return (
    <>
      <TopBar title={color.code} onBack={back} />
      <PageBody>
        <section className="color-detail-hero">
          <Swatch color={color.hex} size="large" />
          <div><span>当前剩余</span><strong>{formatQuantity(summary.remaining)}</strong></div>
        </section>
        <section className="detail-section">
          <h2>库存明细</h2>
          <dl className="metric-list">
            <div><dt>初始数量</dt><dd>{formatQuantity(summary.initial)}</dd></div>
            <div><dt>累计补仓</dt><dd>+{formatQuantity(summary.restocked)}</dd></div>
            <div><dt>库存调整</dt><dd>{summary.adjusted > 0 ? "+" : ""}{formatQuantity(summary.adjusted)}</dd></div>
            <div><dt>手动消耗</dt><dd>{formatQuantity(summary.manualConsumed)}</dd></div>
            <div><dt>图纸消耗</dt><dd>{formatQuantity(summary.patternConsumed)}</dd></div>
            <div className="metric-list__total"><dt>剩余数量</dt><dd>{formatQuantity(summary.remaining)}</dd></div>
          </dl>
        </section>
        <section className="detail-section stock-editor">
          <h2>编辑在仓数量</h2>
          <div className="stock-editor__row">
            <label htmlFor="remaining-quantity">在仓数量</label>
            <QuantityInput
              value={targetRemaining}
              ariaLabel={`${color.code} 在仓数量`}
              onChange={(value) => { setTargetRemaining(value); setSaved(false); }}
            />
            <button className="button button--primary" disabled={targetRemaining === ""} onClick={saveRemaining}>
              <Save size={17} />保存
            </button>
          </div>
          {saved ? <span className="stock-editor__saved"><Check size={15} />已更新</span> : null}
        </section>
        <div className="fixed-action fixed-action--split">
          <button className="button button--secondary" onClick={() => navigate({ type: "restock", initialColorId: colorId })}>
            <PackagePlus size={19} />补仓
          </button>
          <button className="button button--primary button--full" onClick={() => navigate({ type: "consume", initialColorId: colorId })}>
            <MinusCircle size={19} />记录消耗
          </button>
        </div>
      </PageBody>
    </>
  );
}

export function BatchInitialPage({ back }: Pick<NavigationProps, "back">) {
  const { data, updateData } = useAppStore();
  const summaries = useMemo(() => getInventorySummaries(data), [data]);
  const isInitialSetup = Object.keys(data.inventory).length === 0
    && beadColors.every((color) => {
      const summary = summaries[color.id];
      return !summary || (
        summary.restocked === 0
        && summary.adjusted === 0
        && summary.manualConsumed === 0
        && summary.patternConsumed === 0
      );
    });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set(
    isInitialSetup
      ? []
      : beadColors
        .filter((color) => {
          const summary = summaries[color.id];
          return Object.hasOwn(data.inventory, color.id) || Boolean(summary && (
            summary.restocked !== 0
            || summary.adjusted !== 0
            || summary.manualConsumed > 0
            || summary.patternConsumed > 0
          ));
        })
        .map((color) => color.id),
  ));
  const [quantities, setQuantities] = useState<Record<string, number | "">>(() =>
    Object.fromEntries(
      beadColors.map((color) => [
        color.id,
        isInitialSetup
          ? data.inventory[color.id] ?? 0
          : Math.max(0, summaries[color.id]?.remaining ?? 0),
      ]),
    ),
  );
  const [dirty, setDirty] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  const filtered = beadColors.filter((color) => matchesColor(color, search));
  const allSelected = selected.size === beadColors.length;

  const toggleColor = (colorId: string) => {
    setDirty(true);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(colorId)) next.delete(colorId);
      else next.add(colorId);
      return next;
    });
  };

  const save = () => {
    updateData((current) => {
      if (isInitialSetup) {
        const inventory = { ...current.inventory };
        selected.forEach((colorId) => {
          inventory[colorId] = Number(quantities[colorId] || 0);
        });
        return { ...current, inventory };
      }

      const items = getStocktakeItems(current, quantities, selected);
      if (!items.length) return current;
      return {
        ...current,
        stockChanges: [
          {
            id: crypto.randomUUID(),
            kind: "correction",
            items,
            note: "库存盘点",
            createdAt: new Date().toISOString(),
          },
          ...(current.stockChanges ?? []),
        ],
      };
    });
    back();
  };

  return (
    <>
      <TopBar
        title={isInitialSetup ? "初始化库存" : "库存盘点"}
        onBack={() => (dirty ? setShowLeave(true) : back())}
        actions={
          <button className="text-button" onClick={save} disabled={!selected.size}>
            保存
          </button>
        }
      />
      <PageBody className="form-page">
        <div className="sticky-tools">
          <SearchField value={search} onChange={setSearch} />
          <label className="select-all-row">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => {
                setDirty(true);
                setSelected(allSelected ? new Set() : new Set(beadColors.map((color) => color.id)));
              }}
            />
            <span>全选全部色号</span>
            <small>已选 {selected.size} / 221</small>
          </label>
          <LetterMultiSelect
            selected={selected}
            onToggle={(letter) => {
              setDirty(true);
              const groupIds = beadColors.filter((color) => color.letter === letter).map((color) => color.id);
              setSelected((current) => {
                const next = new Set(current);
                const allSelected = groupIds.every((colorId) => next.has(colorId));
                groupIds.forEach((colorId) => allSelected ? next.delete(colorId) : next.add(colorId));
                return next;
              });
            }}
          />
        </div>
        <div className="editable-color-list">
          {filtered.map((color) => {
            const checked = selected.has(color.id);
            return (
              <div className={`editable-color-row ${checked ? "is-selected" : ""}`} key={color.id}>
                <label className="check-cell">
                  <input type="checkbox" checked={checked} onChange={() => toggleColor(color.id)} />
                  <Swatch color={color.hex} />
                  <strong>{color.code}</strong>
                </label>
                <QuantityInput
                  value={quantities[color.id] ?? ""}
                  disabled={!checked}
                  ariaLabel={`${color.code} ${isInitialSetup ? "初始数量" : "盘点数量"}`}
                  onChange={(value) => {
                    setDirty(true);
                    setQuantities((current) => ({ ...current, [color.id]: value }));
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="fixed-action">
          <button className="button button--primary button--full" onClick={save} disabled={!selected.size}>
            <Save size={19} />{isInitialSetup ? "完成初始化" : "保存盘点"}（{selected.size} 色）
          </button>
        </div>
      </PageBody>
      {showLeave ? (
        <ConfirmDialog
          title="放弃修改？"
          description={`当前${isInitialSetup ? "库存初始化" : "库存盘点"}尚未保存。`}
          confirmLabel="放弃"
          danger
          onCancel={() => setShowLeave(false)}
          onConfirm={back}
        />
      ) : null}
    </>
  );
}

export function RestockPage({ initialColorId, back }: Pick<NavigationProps, "back"> & { initialColorId?: string }) {
  const { data, updateData } = useAppStore();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(initialColorId ? [initialColorId] : []);
  const [batchQuantity, setBatchQuantity] = useState<number | "">("");
  const [note, setNote] = useState("");
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const quantity = Number(batchQuantity || 0);
  const validItems: StockChangeItem[] = quantity > 0
    ? selected.map((colorId) => ({ colorId, quantity }))
    : [];
  const available = beadColors.filter(
    (color) => !selected.includes(color.id) && matchesColor(color, search),
  );

  const save = () => {
    if (!validItems.length) return;
    updateData((current) => ({
      ...current,
      stockChanges: [
        {
          id: crypto.randomUUID(),
          kind: "restock",
          items: validItems,
          note: note.trim() || undefined,
          createdAt: new Date().toISOString(),
        },
        ...(current.stockChanges ?? []),
      ],
    }));
    back();
  };

  return (
    <>
      <TopBar title="补仓" onBack={back} actions={<button className="text-button" disabled={!validItems.length} onClick={save}>保存</button>} />
      <PageBody className="form-page">
        <section className="form-section form-section--first">
          <div className="section-heading"><h2>已选颜色</h2><span>{selected.length} 色</span></div>
          {selected.length ? (
            <>
              <div className="batch-quantity-row">
                <label htmlFor="restock-batch-quantity">每个颜色补仓</label>
                <QuantityInput
                  value={batchQuantity}
                  ariaLabel="每个颜色补仓数量"
                  onChange={setBatchQuantity}
                />
                <span>合计 +{formatQuantity(quantity * selected.length)}</span>
              </div>
              <div className="editable-color-list compact-list">
                {selected.map((colorId) => {
                  const color = beadColors.find((item) => item.id === colorId)!;
                  const remaining = getColorSummary(data, colorId).remaining;
                  return (
                    <div className="consume-row consume-row--selected" key={colorId}>
                      <Swatch color={color.hex} />
                      <div className="consume-row__meta"><strong>{color.code}</strong><small>当前 {formatQuantity(remaining)}</small></div>
                      <button
                        className="icon-button icon-button--small"
                        onClick={() => setSelected((current) => current.filter((id) => id !== colorId))}
                        aria-label={`移除 ${color.code}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState title="先选择需要补仓的颜色" />
          )}
        </section>

        <section className="form-section">
          <h2>添加颜色</h2>
          <SearchField value={search} onChange={setSearch} />
          <LetterMultiSelect
            selected={selectedSet}
            onToggle={(letter) => {
              const groupIds = beadColors.filter((color) => color.letter === letter).map((color) => color.id);
              setSelected((current) => {
                const currentSet = new Set(current);
                const allSelected = groupIds.every((colorId) => currentSet.has(colorId));
                return allSelected
                  ? current.filter((colorId) => !groupIds.includes(colorId))
                  : [...current, ...groupIds.filter((colorId) => !currentSet.has(colorId))];
              });
              setSearch("");
            }}
          />
          <div className="picker-grid">
            {available.map((color) => (
              <button
                key={color.id}
                onClick={() => {
                  setSelected((current) => [...current, color.id]);
                  setSearch("");
                }}
              >
                <Swatch color={color.hex} />
                <strong>{color.code}</strong>
                <span>添加</span>
              </button>
            ))}
          </div>
        </section>

        <section className="form-section">
          <label className="field-label" htmlFor="restock-note">备注</label>
          <textarea id="restock-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：新购补豆" rows={3} />
        </section>
        <div className="fixed-action">
          <button className="button button--primary button--full" disabled={!validItems.length} onClick={save}>
            <PackagePlus size={19} />保存补仓
          </button>
        </div>
      </PageBody>
    </>
  );
}

export function ConsumePage({ initialColorId, back }: Pick<NavigationProps, "back"> & { initialColorId?: string }) {
  const { data, updateData } = useAppStore();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>(initialColorId ? [initialColorId] : []);
  const [batchQuantity, setBatchQuantity] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [negativeItems, setNegativeItems] = useState<ConsumptionItem[] | null>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const quantity = Number(batchQuantity || 0);
  const validItems = quantity > 0
    ? selected.map((colorId) => ({ colorId, quantity }))
    : [];
  const available = beadColors.filter(
    (color) => !selected.includes(color.id) && matchesColor(color, search),
  );

  const commit = (items: ConsumptionItem[]) => {
    updateData((current) => ({
      ...current,
      consumptions: [
        {
          id: crypto.randomUUID(),
          items,
          note: note.trim() || undefined,
          createdAt: new Date().toISOString(),
        },
        ...current.consumptions,
      ],
    }));
    back();
  };

  const save = () => {
    const negatives = validItems.filter(
      (item) => getColorSummary(data, item.colorId).remaining - item.quantity < 0,
    );
    if (negatives.length) setNegativeItems(negatives);
    else commit(validItems);
  };

  return (
    <>
      <TopBar title="记录消耗" onBack={back} actions={<button className="text-button" disabled={!validItems.length} onClick={save}>保存</button>} />
      <PageBody className="form-page">
        <section className="form-section form-section--first">
          <div className="section-heading"><h2>已选颜色</h2><span>{selected.length} 色</span></div>
          {selected.length ? (
            <>
              <div className="batch-quantity-row">
                <label htmlFor="consume-batch-quantity">每个颜色消耗</label>
                <QuantityInput
                  value={batchQuantity}
                  ariaLabel="每个颜色消耗数量"
                  onChange={setBatchQuantity}
                />
                <span>合计 -{formatQuantity(quantity * selected.length)}</span>
              </div>
              <div className="editable-color-list compact-list">
                {selected.map((colorId) => {
                  const color = beadColors.find((item) => item.id === colorId)!;
                  const remaining = getColorSummary(data, colorId).remaining;
                  return (
                    <div className="consume-row consume-row--selected" key={colorId}>
                      <Swatch color={color.hex} />
                      <div className="consume-row__meta"><strong>{color.code}</strong><small>剩余 {formatQuantity(remaining)}</small></div>
                      <button
                        className="icon-button icon-button--small"
                        onClick={() => setSelected((current) => current.filter((id) => id !== colorId))}
                        aria-label={`移除 ${color.code}`}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState title="先选择需要记录的颜色" />
          )}
        </section>

        <section className="form-section">
          <h2>添加颜色</h2>
          <SearchField value={search} onChange={setSearch} />
          <LetterMultiSelect
            selected={selectedSet}
            onToggle={(letter) => {
              const groupIds = beadColors.filter((color) => color.letter === letter).map((color) => color.id);
              setSelected((current) => {
                const currentSet = new Set(current);
                const allSelected = groupIds.every((colorId) => currentSet.has(colorId));
                return allSelected
                  ? current.filter((colorId) => !groupIds.includes(colorId))
                  : [...current, ...groupIds.filter((colorId) => !currentSet.has(colorId))];
              });
              setSearch("");
            }}
          />
          <div className="picker-grid">
            {available.map((color) => (
              <button
                key={color.id}
                onClick={() => {
                  setSelected((current) => [...current, color.id]);
                  setSearch("");
                }}
              >
                <Swatch color={color.hex} />
                <strong>{color.code}</strong>
                <span>添加</span>
              </button>
            ))}
          </div>
        </section>

        <section className="form-section">
          <label className="field-label" htmlFor="consume-note">备注</label>
          <textarea id="consume-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：补做钥匙扣" rows={3} />
        </section>
        <div className="fixed-action">
          <button className="button button--primary button--full" disabled={!validItems.length} onClick={save}>
            <Check size={19} />保存消耗
          </button>
        </div>
      </PageBody>

      {negativeItems ? (
        <ConfirmDialog
          title="库存将变为负数"
          description={
            <ul className="warning-list">
              {negativeItems.map((item) => (
                <li key={item.colorId}>
                  {item.colorId}：{getColorSummary(data, item.colorId).remaining - item.quantity}
                </li>
              ))}
            </ul>
          }
          confirmLabel="仍然保存"
          onCancel={() => setNegativeItems(null)}
          onConfirm={() => commit(validItems)}
        />
      ) : null}
    </>
  );
}
