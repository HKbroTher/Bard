interface Props<T extends string | number> {
  value: T;
  options: { id: T; label: string }[];
  onChange(value: T): void;
}

export function Segmented<T extends string | number>({ value, options, onChange }: Props<T>) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={String(o.id)} type="button" role="radio" aria-checked={o.id === value} className={o.id === value ? "active" : ""} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
