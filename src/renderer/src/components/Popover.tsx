import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  placement?: "top" | "bottom";
  align?: "start" | "end";
  className?: string;
  title?: string;
}

/** A button that opens a floating menu; closes on outside click or Escape. */
export function Popover({ trigger, children, placement = "bottom", align = "start", className = "", title }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`popover ${className}`} ref={ref}>
      <button type="button" className="popover-trigger" aria-expanded={open} title={title} onClick={() => setOpen((o) => !o)}>
        {trigger(open)}
      </button>
      {open && <div className={`menu menu-${placement} menu-${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function MenuItem({
  selected,
  onClick,
  children,
  hint,
}: {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <button type="button" className={`menu-item ${selected ? "selected" : ""}`} onClick={onClick}>
      <span className="menu-item-text">
        <span>{children}</span>
        {hint && <small>{hint}</small>}
      </span>
      {selected && <span className="menu-check">✓</span>}
    </button>
  );
}
