import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { Group } from '../school/catalog';
import './pickers.css';

const norm = (s: string) => s.trim().toLowerCase();
/** Matches the start of any word, so "phy" finds Physics and Physical Education but not Geography. */
const matches = (item: string, q: string) => !q.trim() || norm(item).split(/[\s/-]+/).some((w) => w.startsWith(norm(q))) || norm(item).startsWith(norm(q));
/** Each item once, in the first group it appears in. */
function dedupe(groups: Group[]) {
  const seen = new Set<string>();
  return groups.map((g) => ({ ...g, items: g.items.filter((i) => (seen.has(norm(i)) ? false : (seen.add(norm(i)), true))) })).filter((g) => g.items.length);
}

/**
 * Pick many from grouped suggestions: chosen items show as dark chips (click to remove), suggestions as light
 * chips (click to add). A search box filters them, and anything typed that isn't listed can be added too.
 * `ordered` keeps the chosen list in the suggestion order (for class levels).
 */
export function ChipPicker({ value, onChange, groups, placeholder = 'Search or type to add', ordered = false, label }: { value: string[]; onChange: (v: string[]) => void; groups: Group[]; placeholder?: string; ordered?: boolean; label: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(groups[0]?.label ?? null);
  const chosen = new Set(value.map(norm));
  const order = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const sort = (list: string[]) => (ordered ? [...list].sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999)) : list);
  const add = (s: string) => {
    const t = s.trim();
    if (!t || chosen.has(norm(t))) return;
    onChange(sort([...value, t]));
  };
  const remove = (s: string) => onChange(value.filter((x) => norm(x) !== norm(s)));
  const filtered = (q ? dedupe(groups) : groups).map((g) => ({ ...g, items: g.items.filter((i) => !chosen.has(norm(i)) && matches(i, q)) })).filter((g) => g.items.length);
  const exact = q.trim() && (chosen.has(norm(q)) || order.some((i) => norm(i) === norm(q)));
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = filtered[0]?.items[0];
      add(q && !exact && !first ? q : first ?? q);
      setQ('');
    }
  };

  return (
    <div className="picker" role="group" aria-label={label}>
      <div className="picker-chosen">
        {value.length ? (
          value.map((v) => (
            <button key={v} type="button" className="chip on" onClick={() => remove(v)} aria-label={`Remove ${v}`}>
              {v} <span aria-hidden>×</span>
            </button>
          ))
        ) : (
          <span className="muted small">Nothing chosen yet. Pick from the suggestions below.</span>
        )}
      </div>
      <input className="picker-search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={placeholder} aria-label={`Search ${label.toLowerCase()}`} />
      {q.trim() && !exact && (
        <button type="button" className="link small picker-custom" onClick={() => (add(q), setQ(''))}>
          Add “{q.trim()}”
        </button>
      )}
      <div className="picker-groups">
        {filtered.map((g) => {
          const show = !!q || open === g.label;
          return (
            <div key={g.label} className="picker-group">
              <div className="picker-group-head">
                <button type="button" className="picker-toggle" onClick={() => setOpen(open === g.label ? null : g.label)} aria-expanded={show}>
                  {g.label} <span className="muted">({g.items.length})</span>
                </button>
                {show && (
                  <button type="button" className="link small" onClick={() => onChange(sort([...value, ...g.items]))}>
                    Add all
                  </button>
                )}
              </div>
              {show && (
                <div className="chips">
                  {g.items.map((i) => (
                    <button key={i} type="button" className="chip" onClick={() => add(i)}>
                      + {i}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One value with a dropdown of suggestions that filters as you type. Anything typed is allowed. */
export function SuggestInput({ value, onChange, groups, placeholder, label, exclude = [], onEnter }: { value: string; onChange: (v: string) => void; groups: Group[]; placeholder?: string; label: string; exclude?: string[]; onEnter?: () => void }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const skip = new Set(exclude.map(norm));
  const list = dedupe(groups)
    .map((g) => ({ ...g, items: g.items.filter((i) => !skip.has(norm(i)) && matches(i, value) && norm(i) !== norm(value)) }))
    .filter((g) => g.items.length);
  const flatList = [...new Set(list.flatMap((g) => g.items))];
  const pick = (s: string) => {
    onChange(s);
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') (e.preventDefault(), setOpen(true), setHi((h) => Math.min(flatList.length - 1, h + 1)));
    else if (e.key === 'ArrowUp') (e.preventDefault(), setHi((h) => Math.max(0, h - 1)));
    else if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'Enter') {
      if (open && flatList[hi] && value.trim() && !flatList.some((i) => norm(i) === norm(value))) {
        e.preventDefault();
        pick(flatList[hi]);
      } else if (onEnter) {
        e.preventDefault();
        setOpen(false);
        onEnter();
      }
    }
  };
  let n = -1;
  return (
    <div
      className="suggest"
      ref={box}
      onBlur={(e) => {
        if (!box.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <input
        value={value}
        onChange={(e) => (onChange(e.target.value), setOpen(true), setHi(0))}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={open && flatList.length > 0}
        aria-controls={id}
        aria-autocomplete="list"
      />
      {open && flatList.length > 0 && (
        <div className="suggest-list" id={id} role="listbox">
          {list.map((g) => (
            <div key={g.label}>
              <div className="suggest-group mono">{g.label}</div>
              {g.items.map((i) => {
                n++;
                const k = n;
                return (
                  <button key={g.label + i} type="button" role="option" aria-selected={k === hi} className={k === hi ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)}>
                    {i}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
