import type { ChangeEvent, PropsWithChildren, ReactNode } from "react";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  ChevronRight,
  Image as ImageIcon,
  Search,
  X,
} from "lucide-react";

type TopBarProps = {
  title: string;
  onBack?: () => void;
  actions?: ReactNode;
};

export function TopBar({ title, onBack, actions }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar__side">
        {onBack ? (
          <button className="icon-button" onClick={onBack} aria-label="返回" title="返回">
            <ArrowLeft size={21} />
          </button>
        ) : null}
      </div>
      <h1>{title}</h1>
      <div className="top-bar__actions">{actions}</div>
    </header>
  );
}

export type RootTab = "warehouse" | "patterns" | "stats";

export function BottomNav({ active, onChange }: { active: RootTab; onChange: (tab: RootTab) => void }) {
  const items: { id: RootTab; label: string; icon: typeof Boxes }[] = [
    { id: "warehouse", label: "豆仓", icon: Boxes },
    { id: "patterns", label: "图纸", icon: ImageIcon },
    { id: "stats", label: "统计", icon: BarChart3 },
  ];
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            className={active === item.id ? "is-active" : ""}
            onClick={() => onChange(item.id)}
          >
            <Icon size={21} strokeWidth={active === item.id ? 2.4 : 2} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder = "搜索色号",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-field">
      <Search size={18} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} aria-label="清除搜索" title="清除搜索">
          <X size={17} />
        </button>
      ) : null}
    </div>
  );
}

export function Swatch({ color, size = "medium" }: { color: string; size?: "small" | "medium" | "large" }) {
  return <span className={`swatch swatch--${size}`} style={{ backgroundColor: color }} />;
}

export function QuantityInput({
  value,
  onChange,
  placeholder = "0",
  disabled,
  ariaLabel,
}: {
  value: number | "";
  onChange: (value: number | "") => void;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value.replace(/\D/g, "");
    onChange(raw === "" ? "" : Number(raw));
  };
  return (
    <input
      className="quantity-input"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={handleChange}
    />
  );
}

export function PageBody({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <main className={`page-body ${className}`}>{children}</main>;
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state__mark" />
      <p>{title}</p>
      {action}
    </div>
  );
}

export function RowLink({ children, onClick }: PropsWithChildren<{ onClick: () => void }>) {
  return (
    <button className="row-link" onClick={onClick}>
      <span>{children}</span>
      <ChevronRight size={19} />
    </button>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = "确认",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="dialog-title">{title}</h2>
        <div className="dialog__description">{description}</div>
        <div className="dialog__actions">
          <button className="button button--secondary" onClick={onCancel}>取消</button>
          <button className={danger ? "button button--danger" : "button button--primary"} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented-control">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={value === option.value ? "is-active" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
