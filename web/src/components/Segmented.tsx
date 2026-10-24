interface Props<T extends string | number> {
  value: T;
  options: { id: T; label: string; description?: string }[];
  onChange: (value: T) => void;
  name: string;
}

export function Segmented<T extends string | number>({ value, options, onChange, name }: Props<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={String(o.id)}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          className={o.id === value ? "active" : ""}
          title={o.description}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
