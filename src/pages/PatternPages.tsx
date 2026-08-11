import { useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  Expand,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Plus,
  ScanText,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { beadColors } from "../data/colors";
import { compressImage } from "../lib/image";
import { formatQuantity, getColorSummary, usageQuantity } from "../lib/inventory";
import { recognizeColorSummary } from "../lib/ocr";
import type { RecognizedUsage } from "../lib/ocr";
import type { Pattern, PatternUsage } from "../types";
import { useAppStore } from "../store";
import type { Screen } from "../navigation";
import {
  ConfirmDialog,
  EmptyState,
  PageBody,
  QuantityInput,
  SearchField,
  SegmentedControl,
  Swatch,
  TopBar,
} from "../components";

type NavigationProps = {
  navigate: (screen: Screen) => void;
  back: () => void;
};

function formatDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function todayInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function RecognitionDialog({
  results,
  onCancel,
  onApply,
}: {
  results: RecognizedUsage[];
  onCancel: () => void;
  onApply: (results: RecognizedUsage[]) => void;
}) {
  const [items, setItems] = useState(results);
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section className="recognition-dialog" role="dialog" aria-modal="true" aria-labelledby="recognition-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>识别完成</span><h2 id="recognition-title">确认用豆汇总</h2></div>
          <button className="icon-button" onClick={onCancel} aria-label="关闭识别结果"><X size={20} /></button>
        </header>
        <p className="recognition-dialog__summary">识别到 {items.length} 色，共 {formatQuantity(total)} 颗</p>
        <div className="recognition-result-list">
          {items.map((item) => {
            const color = beadColors.find((candidate) => candidate.id === item.colorId)!;
            return (
              <div key={item.colorId}>
                <Swatch color={color.hex} />
                <strong>{color.code}</strong>
                <QuantityInput
                  value={item.quantity}
                  ariaLabel={`${color.code} 识别数量`}
                  onChange={(value) => setItems((current) => current.map((candidate) => candidate.colorId === item.colorId
                    ? { ...candidate, quantity: Number(value || 0) }
                    : candidate))}
                />
                <button className="icon-button icon-button--small" onClick={() => setItems((current) => current.filter((candidate) => candidate.colorId !== item.colorId))} aria-label={`移除识别结果 ${color.code}`}><Trash2 size={17} /></button>
              </div>
            );
          })}
        </div>
        <div className="dialog__actions">
          <button className="button button--secondary" onClick={onCancel}>取消</button>
          <button className="button button--primary" disabled={!items.some((item) => item.quantity > 0)} onClick={() => onApply(items.filter((item) => item.quantity > 0))}>填入用豆清单</button>
        </div>
      </section>
    </div>
  );
}

export function PatternsPage({ navigate }: Pick<NavigationProps, "navigate">) {
  const { data } = useAppStore();
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const patterns = data.patterns.filter((pattern) => pattern.status === tab);
  return (
    <>
      <TopBar
        title="图纸"
        actions={
          <button className="icon-button" onClick={() => navigate({ type: "pattern-form" })} aria-label="新增图纸" title="新增图纸">
            <Plus size={22} />
          </button>
        }
      />
      <PageBody>
        <div className="page-tabs">
          <SegmentedControl
            value={tab}
            options={[{ value: "todo", label: "待拼" }, { value: "done", label: "已拼" }]}
            onChange={setTab}
          />
        </div>
        {patterns.length ? (
          <div className="pattern-list">
            {patterns.map((pattern) => {
              const total = pattern.usages.reduce(
                (sum, usage) => sum + (pattern.status === "done" ? usageQuantity(usage) : usage.expectedQuantity),
                0,
              );
              return (
                <button className="pattern-row" key={pattern.id} onClick={() => navigate({ type: "pattern-detail", patternId: pattern.id })}>
                  <div className="pattern-thumb">
                    {pattern.imageDataUrl ? <img src={pattern.imageDataUrl} alt="" /> : <ImagePlus size={26} />}
                  </div>
                  <div className="pattern-row__content">
                    <strong>{pattern.name}</strong>
                    <span>{pattern.usages.length} 色 / {formatQuantity(total)} 颗</span>
                    <small>{pattern.status === "done" ? `完成 ${formatDate(pattern.completedAt)}` : `创建 ${formatDate(pattern.createdAt)}`}</small>
                  </div>
                  <span className={`status-label status-label--${pattern.status}`}>{pattern.status === "done" ? "已拼" : "待拼"}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title={tab === "todo" ? "还没有待拼图纸" : "还没有已拼图纸"}
            action={<button className="button button--primary" onClick={() => navigate({ type: "pattern-form" })}><Plus size={18} />新增图纸</button>}
          />
        )}
      </PageBody>
    </>
  );
}

export function PatternFormPage({ patternId, back }: Pick<NavigationProps, "back"> & { patternId?: string }) {
  const { data, updateData } = useAppStore();
  const existing = data.patterns.find((pattern) => pattern.id === patternId);
  const [name, setName] = useState(existing?.name ?? "");
  const [status, setStatus] = useState<"todo" | "done">(existing?.status ?? "todo");
  const [imageDataUrl, setImageDataUrl] = useState(existing?.imageDataUrl);
  const [note, setNote] = useState(existing?.note ?? "");
  const [usages, setUsages] = useState<PatternUsage[]>(existing?.usages ?? []);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [savingImage, setSavingImage] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [sourceImage, setSourceImage] = useState<File | null>(null);
  const [recognitionStatus, setRecognitionStatus] = useState<"idle" | "running" | "done" | "none" | "error">("idle");
  const [recognitionProgress, setRecognitionProgress] = useState(0);
  const [recognizedUsages, setRecognizedUsages] = useState<RecognizedUsage[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const available = beadColors.filter(
    (color) => !usages.some((usage) => usage.colorId === color.id) && color.code.toLowerCase().includes(search.toLowerCase()),
  );

  const projectedShortages = status === "done" ? usages.flatMap((usage) => {
    const oldUsage = existing?.status === "done"
      ? existing.usages.find((item) => item.colorId === usage.colorId)
      : undefined;
    const availableQuantity = getColorSummary(data, usage.colorId).remaining + (oldUsage ? usageQuantity(oldUsage) : 0);
    const nextQuantity = usage.actualQuantity ?? usage.expectedQuantity;
    const projectedRemaining = availableQuantity - nextQuantity;
    return projectedRemaining < 0 ? [{ colorId: usage.colorId, remaining: projectedRemaining }] : [];
  }) : [];

  const normalizedUsages = () => usages
    .filter((usage) => usage.expectedQuantity > 0 || Number(usage.actualQuantity) > 0)
    .map((usage) => ({
      ...usage,
      actualQuantity: status === "done" ? (usage.actualQuantity ?? usage.expectedQuantity) : undefined,
    }));

  const commit = () => {
    const now = new Date().toISOString();
    const pattern: Pattern = {
      id: existing?.id ?? crypto.randomUUID(),
      name: name.trim(),
      status,
      imageDataUrl,
      note: note.trim() || undefined,
      usages: normalizedUsages(),
      createdAt: existing?.createdAt ?? now,
      completedAt: status === "done" ? (existing?.completedAt ?? now) : undefined,
    };
    updateData((current) => ({
      ...current,
      patterns: existing
        ? current.patterns.map((item) => item.id === existing.id ? pattern : item)
        : [pattern, ...current.patterns],
    }));
    back();
  };

  const attemptSave = () => {
    if (!name.trim()) {
      setError("请填写图纸名称");
      return;
    }
    setError("");
    if (status === "done" || existing?.status === "done") setConfirmSave(true);
    else commit();
  };

  const updateUsage = (colorId: string, field: "expectedQuantity" | "actualQuantity", value: number | "") => {
    setUsages((current) => current.map((usage) => usage.colorId === colorId
      ? { ...usage, [field]: value === "" ? (field === "actualQuantity" ? undefined : 0) : value }
      : usage));
  };

  const runRecognition = async (file: File) => {
    setRecognitionStatus("running");
    setRecognitionProgress(1);
    setRecognizedUsages(null);
    try {
      const results = await recognizeColorSummary(file, setRecognitionProgress);
      if (results.length) {
        setRecognitionStatus("done");
        setRecognizedUsages(results);
      } else {
        setRecognitionStatus("none");
      }
    } catch {
      setRecognitionStatus("error");
    }
  };

  const applyRecognizedUsages = (results: RecognizedUsage[]) => {
    setUsages((current) => {
      const next = new Map(current.map((usage) => [usage.colorId, usage]));
      results.forEach((result) => {
        const existingUsage = next.get(result.colorId);
        next.set(result.colorId, {
          colorId: result.colorId,
          expectedQuantity: result.quantity,
          actualQuantity: existingUsage?.actualQuantity,
        });
      });
      return [...next.values()];
    });
    setRecognizedUsages(null);
    setRecognitionStatus("done");
  };

  return (
    <>
      <TopBar title={existing ? "编辑图纸" : "新增图纸"} onBack={back} actions={<button className="text-button" onClick={attemptSave}>保存</button>} />
      <PageBody className="form-page">
        <section className="form-section form-section--first">
          <label className="image-upload">
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setSourceImage(file);
                setSavingImage(true);
                try {
                  setImageDataUrl(await compressImage(file));
                } finally {
                  setSavingImage(false);
                }
                void runRecognition(file);
              }}
            />
            {imageDataUrl ? <img src={imageDataUrl} alt="图纸预览" /> : <><Camera size={28} /><span>{savingImage ? "正在处理" : "添加图纸图片"}</span></>}
          </label>
          {imageDataUrl ? (
            <>
              <div className={`recognition-status recognition-status--${recognitionStatus}`}>
                {recognitionStatus === "running" ? (
                  <>
                    <div><LoaderCircle className="spin" size={18} /><span>正在识别色号汇总</span><strong>{recognitionProgress}%</strong></div>
                    <span className="recognition-progress"><i style={{ width: `${recognitionProgress}%` }} /></span>
                  </>
                ) : null}
                {recognitionStatus === "done" && !recognizedUsages ? <div><Check size={18} /><span>色号汇总已填入用豆清单</span></div> : null}
                {recognitionStatus === "none" ? <div><ScanText size={18} /><span>没有识别到色号汇总，请手动填写</span></div> : null}
                {recognitionStatus === "error" ? <div><ScanText size={18} /><span>识别失败，可重新识别或手动填写</span></div> : null}
              </div>
              <div className="image-actions">
                {sourceImage && recognitionStatus !== "running" ? <button type="button" onClick={() => void runRecognition(sourceImage)}><ScanText size={16} />重新识别</button> : null}
                <button type="button" className="is-danger" onClick={() => { setImageDataUrl(undefined); setSourceImage(null); setRecognitionStatus("idle"); setRecognizedUsages(null); }}><Trash2 size={16} />移除图片</button>
              </div>
            </>
          ) : null}
        </section>

        <section className="form-section field-stack">
          <label className="field-label" htmlFor="pattern-name">图纸名称</label>
          <input id="pattern-name" className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：小狗挂件" />
          {error ? <p className="field-error">{error}</p> : null}
          <span className="field-label">状态</span>
          <SegmentedControl
            value={status}
            options={[{ value: "todo", label: "待拼" }, { value: "done", label: "已拼" }]}
            onChange={setStatus}
          />
        </section>

        <section className="form-section">
          <div className="section-heading"><h2>用豆清单</h2><span>{usages.length} 色</span></div>
          {usages.length ? (
            <div className="usage-list">
              {usages.map((usage) => {
                const color = beadColors.find((item) => item.id === usage.colorId)!;
                return (
                  <div className="usage-edit-row" key={usage.colorId}>
                    <div className="usage-color"><Swatch color={color.hex} /><strong>{color.code}</strong></div>
                    <label><span>预计</span><QuantityInput ariaLabel={`${color.code} 预计用量`} value={usage.expectedQuantity || ""} onChange={(value) => updateUsage(usage.colorId, "expectedQuantity", value)} /></label>
                    {status === "done" ? <label><span>实际</span><QuantityInput ariaLabel={`${color.code} 实际用量`} value={usage.actualQuantity ?? ""} placeholder={String(usage.expectedQuantity || 0)} onChange={(value) => updateUsage(usage.colorId, "actualQuantity", value)} /></label> : null}
                    <button className="icon-button icon-button--small" onClick={() => setUsages((current) => current.filter((item) => item.colorId !== usage.colorId))} aria-label={`移除 ${color.code}`}><X size={17} /></button>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState title="还没有添加颜色" />}

          <div className="color-picker-block">
            <SearchField value={search} onChange={setSearch} placeholder="搜索并添加色号" />
            {search ? (
              <div className="picker-grid picker-grid--short">
                {available.slice(0, 30).map((color) => (
                  <button key={color.id} onClick={() => { setUsages((current) => [...current, { colorId: color.id, expectedQuantity: 0 }]); setSearch(""); }}>
                    <Swatch color={color.hex} /><strong>{color.code}</strong><span>添加</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="form-section">
          <label className="field-label" htmlFor="pattern-note">备注</label>
          <textarea id="pattern-note" rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="尺寸、来源或制作注意事项" />
        </section>
        <div className="fixed-action">
          <button className="button button--primary button--full" onClick={attemptSave}><Save size={19} />保存图纸</button>
        </div>
      </PageBody>
      {confirmSave ? (
        <ConfirmDialog
          title={status === "done" ? "确认实际用量" : "改回待拼？"}
          description={status === "done" ? (
            <>
              <p className="dialog-copy">保存后将按实际用量计入库存消耗。实际数量为空时使用预计数量。</p>
              {projectedShortages.length ? (
                <ul className="warning-list">
                  {projectedShortages.map((item) => <li key={item.colorId}>{item.colorId}：保存后剩余 {item.remaining}</li>)}
                </ul>
              ) : null}
            </>
          ) : "该图纸产生的库存消耗将被撤销。"}
          confirmLabel="确认保存"
          onCancel={() => setConfirmSave(false)}
          onConfirm={commit}
        />
      ) : null}
      {recognizedUsages ? (
        <RecognitionDialog
          results={recognizedUsages}
          onCancel={() => setRecognizedUsages(null)}
          onApply={applyRecognizedUsages}
        />
      ) : null}
    </>
  );
}

export function PatternDetailPage({ patternId, navigate, back }: NavigationProps & { patternId: string }) {
  const { data, updateData } = useAppStore();
  const pattern = data.patterns.find((item) => item.id === patternId);
  const [showDelete, setShowDelete] = useState(false);
  const [preview, setPreview] = useState(false);
  if (!pattern) return null;
  const total = pattern.usages.reduce((sum, usage) => sum + (pattern.status === "done" ? usageQuantity(usage) : usage.expectedQuantity), 0);
  return (
    <>
      <TopBar
        title="图纸详情"
        onBack={back}
        actions={<button className="icon-button" onClick={() => navigate({ type: "pattern-form", patternId })} aria-label="编辑图纸" title="编辑图纸"><Pencil size={20} /></button>}
      />
      <PageBody className="detail-page">
        <button className="pattern-cover" disabled={!pattern.imageDataUrl} onClick={() => setPreview(true)}>
          {pattern.imageDataUrl ? <><img src={pattern.imageDataUrl} alt={pattern.name} /><span><Expand size={16} />查看大图</span></> : <ImagePlus size={34} />}
        </button>
        <section className="pattern-title-block">
          <div><h2>{pattern.name}</h2><span className={`status-label status-label--${pattern.status}`}>{pattern.status === "done" ? "已拼" : "待拼"}</span></div>
          <p>{pattern.status === "done" ? `完成于 ${formatDate(pattern.completedAt)}` : `创建于 ${formatDate(pattern.createdAt)}`} · {pattern.usages.length} 色 · {formatQuantity(total)} 颗</p>
        </section>
        <section className="detail-section">
          <h2>用豆清单</h2>
          <div className="usage-detail-list">
            {pattern.usages.map((usage) => {
              const color = beadColors.find((item) => item.id === usage.colorId)!;
              const remaining = getColorSummary(data, usage.colorId).remaining;
              const insufficient = pattern.status === "todo" && usage.expectedQuantity > remaining;
              return (
                <div key={usage.colorId}>
                  <Swatch color={color.hex} />
                  <strong>{color.code}</strong>
                  <span>{pattern.status === "done" ? `实际 ${formatQuantity(usageQuantity(usage))}` : `预计 ${formatQuantity(usage.expectedQuantity)}`}</span>
                  <small className={insufficient ? "is-low" : ""}>{pattern.status === "todo" ? (insufficient ? `缺 ${formatQuantity(usage.expectedQuantity - remaining)}` : `余 ${formatQuantity(remaining)}`) : ""}</small>
                </div>
              );
            })}
            {!pattern.usages.length ? <p className="muted-text">未记录用豆清单</p> : null}
          </div>
        </section>
        {pattern.note ? <section className="detail-section"><h2>备注</h2><p className="note-text">{pattern.note}</p></section> : null}
        <div className="detail-actions">
          {pattern.status === "todo" ? <button className="button button--primary button--full" onClick={() => navigate({ type: "complete-pattern", patternId })}><Check size={19} />标记为已完成</button> : null}
          <button className="button button--plain-danger button--full" onClick={() => setShowDelete(true)}><Trash2 size={18} />删除图纸</button>
        </div>
      </PageBody>
      {showDelete ? (
        <ConfirmDialog
          title="删除这张图纸？"
          description={pattern.status === "done" ? "删除后，这张图纸产生的库存消耗也会被撤销。" : "删除后无法恢复。"}
          confirmLabel="删除"
          danger
          onCancel={() => setShowDelete(false)}
          onConfirm={() => {
            updateData((current) => ({ ...current, patterns: current.patterns.filter((item) => item.id !== patternId) }));
            back();
          }}
        />
      ) : null}
      {preview && pattern.imageDataUrl ? (
        <div className="image-preview" onClick={() => setPreview(false)}><button aria-label="关闭预览"><X size={23} /></button><img src={pattern.imageDataUrl} alt={pattern.name} /></div>
      ) : null}
    </>
  );
}

export function CompletePatternPage({ patternId, back }: Pick<NavigationProps, "back"> & { patternId: string }) {
  const { data, updateData } = useAppStore();
  const pattern = data.patterns.find((item) => item.id === patternId);
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries((pattern?.usages ?? []).map((usage) => [usage.colorId, usage.actualQuantity ?? usage.expectedQuantity])),
  );
  const [date, setDate] = useState(todayInput);
  const [negatives, setNegatives] = useState<string[] | null>(null);
  const shortageIds = useMemo(() => pattern?.usages.filter((usage) => getColorSummary(data, usage.colorId).remaining - (quantities[usage.colorId] ?? 0) < 0).map((usage) => usage.colorId) ?? [], [data, pattern, quantities]);
  if (!pattern) return null;

  const commit = () => {
    updateData((current) => ({
      ...current,
      patterns: current.patterns.map((item) => item.id === patternId ? {
        ...item,
        status: "done",
        completedAt: new Date(`${date}T12:00:00`).toISOString(),
        usages: item.usages.map((usage) => ({ ...usage, actualQuantity: quantities[usage.colorId] ?? 0 })),
      } : item),
    }));
    back();
  };

  return (
    <>
      <TopBar title="完成图纸" onBack={back} />
      <PageBody className="form-page">
        <section className="completion-intro"><h2>{pattern.name}</h2><p>确认实际用量后计入库存消耗</p></section>
        <section className="form-section form-section--first">
          <div className="usage-list">
            {pattern.usages.map((usage) => {
              const color = beadColors.find((item) => item.id === usage.colorId)!;
              return (
                <div className="complete-row" key={usage.colorId}>
                  <Swatch color={color.hex} />
                  <div><strong>{color.code}</strong><small>预计 {formatQuantity(usage.expectedQuantity)}</small></div>
                  <QuantityInput value={quantities[usage.colorId] ?? ""} onChange={(value) => setQuantities((current) => ({ ...current, [usage.colorId]: Number(value || 0) }))} ariaLabel={`${color.code} 实际用量`} />
                </div>
              );
            })}
          </div>
        </section>
        <section className="form-section"><label className="field-label" htmlFor="completed-date">完成日期</label><input id="completed-date" className="text-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></section>
        <div className="fixed-action"><button className="button button--primary button--full" onClick={() => shortageIds.length ? setNegatives(shortageIds) : commit()}><Check size={19} />确认完成</button></div>
      </PageBody>
      {negatives ? (
        <ConfirmDialog
          title="部分颜色库存不足"
          description={<ul className="warning-list">{negatives.map((colorId) => <li key={colorId}>{colorId}：完成后剩余 {getColorSummary(data, colorId).remaining - quantities[colorId]}</li>)}</ul>}
          confirmLabel="仍然完成"
          onCancel={() => setNegatives(null)}
          onConfirm={commit}
        />
      ) : null}
    </>
  );
}
