import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './charts.css';

/** Series colours for charts: this term in cobalt, the term before in orange (validated for colour-blind readers). */
export interface Series {
  name: string;
  tone: 'now' | 'before';
}

type Tip = { x: number; y: number; title: string; lines: { s: Series; v: string }[] } | null;

/** Frame for a chart: title, legend when there are two series, and a table view of the same figures. */
export function ChartCard({ title, note, series, table, children, action, wide }: { title: string; note?: string; series: Series[]; table: { head: string[]; rows: (string | number)[][] }; children: ReactNode; action?: ReactNode; wide?: boolean }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`panel chart-card${wide ? ' wide' : ''}`}>
      <div className="panel-head">
        <h2 className="h3">{title}</h2>
        <div className="chart-tools">
          {action}
          <button className="link small" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? 'Show chart' : 'Show table'}
          </button>
        </div>
      </div>
      {note && <p className="muted small chart-note">{note}</p>}
      {series.length > 1 && (
        <ul className="legend" aria-label="Legend">
          {series.map((s) => (
            <li key={s.name}>
              <i className={`key-dot ${s.tone}`} aria-hidden />
              {s.name}
            </li>
          ))}
        </ul>
      )}
      {asTable ? (
        <div className="table-wrap">
          <table className="chart-table">
            <thead>
              <tr>
                {table.head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}

function TipBox({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <b>{tip.title}</b>
      {tip.lines.map((l) => (
        <span key={l.s.name}>
          <i className={`key-dot ${l.s.tone}`} aria-hidden />
          {l.s.name}: {l.v}
        </span>
      ))}
    </div>
  );
}

const fmt = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? 'no figure' : `${unit === '₦' ? '₦' : ''}${Math.round(v * 10) / 10 === Math.round(v) ? Math.round(v).toLocaleString('en-NG') : (Math.round(v * 10) / 10).toLocaleString('en-NG')}${unit === '₦' ? '' : unit}`);

/** Horizontal bars, one row per item, up to two series per row. The value of the first series is printed at the end. */
export function BarRows({ rows, series, max, unit = '%' }: { rows: { label: string; values: (number | null)[]; to?: string }[]; series: Series[]; max?: number; unit?: string }) {
  const [tip, setTip] = useState<Tip>(null);
  const top = max ?? Math.max(1, ...rows.flatMap((r) => r.values.filter((v): v is number => v !== null)));
  if (!rows.length) return <p className="muted small">No figures yet.</p>;
  return (
    <div className="bar-rows" onMouseLeave={() => setTip(null)}>
      {rows.map((r) => (
        <div
          key={r.label}
          className="bar-row"
          onMouseMove={(e) => {
            const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
            setTip({ x: e.clientX - box.left + 12, y: e.clientY - box.top + 12, title: r.label, lines: series.map((s, i) => ({ s, v: fmt(r.values[i], unit) })) });
          }}
        >
          <span className="bar-label">{r.to ? <Link to={r.to}>{r.label}</Link> : r.label}</span>
          <span className="bar-track">
            {series.map((s, i) => (
              <i key={s.name} className={`bar-fill ${s.tone}`} style={{ width: `${Math.max(0, Math.min(1, (r.values[i] ?? 0) / top)) * 100}%` }} />
            ))}
          </span>
          <span className="bar-value">{fmt(r.values[0], unit)}</span>
        </div>
      ))}
      <TipBox tip={tip} />
    </div>
  );
}

/** Width of an element, kept up to date. A callback ref, so it attaches even when the element appears later. */
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, Math.max(240, w || 240)] as const;
}

/** A line over time (0 to 100%) with markers, a crosshair and a tooltip. Two series share one axis. */
export function LineChart({ points, series, unit = '%', floor = 0, height = 200 }: { points: { label: string; values: (number | null)[] }[]; series: Series[]; unit?: string; floor?: number; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const h = height;
  const pad = { l: 36, r: 12, t: 12, b: 28 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  if (!points.length) return <p className="muted small">No registers yet.</p>;
  const x = (i: number) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - floor) / (100 - floor)) * ih;
  const ticks = [floor, floor + (100 - floor) / 2, 100];
  const path = (si: number) => {
    let d = '';
    let pen = false;
    points.forEach((p, i) => {
      const v = p.values[si];
      if (v === null || v === undefined) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const every = Math.ceil(points.length / Math.max(2, Math.floor(iw / 70)));
  return (
    <div className="line-chart" ref={ref}>
      <svg
        width={w}
        height={h}
        role="img"
        aria-label={`${series[0].name}: ${points.map((p) => `${p.label} ${fmt(p.values[0], unit)}`).join(', ')}`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - r.left;
          let best = 0;
          points.forEach((_, i) => {
            if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
          });
          setHover(best);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} />
            <text className="axis" x={pad.l - 6} y={y(t) + 4} textAnchor="end">
              {t}
              {unit}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text key={p.label} className="axis" x={x(i)} y={h - 8} textAnchor="middle">
              {p.label}
            </text>
          ) : null,
        )}
        {hover !== null && <line className="crosshair" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} />}
        {series.map((s, si) => (
          <g key={s.name} className={`series ${s.tone}`}>
            <path d={path(si)} />
            {points.map((p, i) => {
              const v = p.values[si];
              return v === null || v === undefined ? null : <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 4} />;
            })}
          </g>
        ))}
      </svg>
      {hover !== null && <TipBox tip={{ x: Math.min(x(hover) + 12, w - 170), y: 8, title: points[hover].label, lines: series.map((s, i) => ({ s, v: fmt(points[hover].values[i], unit) })) }} />}
    </div>
  );
}

/** Vertical columns per category (grade spread), up to two series side by side. */
export function Columns({ cats, series, unit = '' }: { cats: { label: string; values: (number | null)[] }[]; series: Series[]; unit?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const h = 180;
  const pad = { l: 8, r: 8, t: 20, b: 24 };
  const ih = h - pad.t - pad.b;
  const top = Math.max(1, ...cats.flatMap((c) => c.values.filter((v): v is number => v !== null)));
  const slot = (w - pad.l - pad.r) / Math.max(1, cats.length);
  const bw = Math.min(24, (slot - 8 - (series.length - 1) * 2) / series.length);
  const col = (x0: number, v: number) => {
    const hh = Math.max(v > 0 ? 2 : 0, (v / top) * ih);
    const y0 = pad.t + ih;
    const r = Math.min(4, hh, bw / 2);
    return `M${x0},${y0}V${y0 - hh + r}Q${x0},${y0 - hh} ${x0 + r},${y0 - hh}H${x0 + bw - r}Q${x0 + bw},${y0 - hh} ${x0 + bw},${y0 - hh + r}V${y0}Z`;
  };
  return (
    <div className="line-chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={w} height={h} role="img" aria-label={cats.map((c) => `${c.label} ${fmt(c.values[0], unit)}`).join(', ')}>
        <line className="baseline" x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} />
        {cats.map((c, ci) => {
          const gx = pad.l + ci * slot + (slot - (bw * series.length + 2 * (series.length - 1))) / 2;
          return (
            <g
              key={c.label}
              onMouseMove={(e) => {
                const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setTip({ x: Math.min(e.clientX - box.left + 12, w - 170), y: e.clientY - box.top - 40, title: c.label, lines: series.map((s, i) => ({ s, v: fmt(c.values[i], unit) })) });
              }}
            >
              <rect x={pad.l + ci * slot} y={pad.t} width={slot} height={ih} fill="transparent" />
              {series.map((s, si) => (c.values[si] ? <path key={s.name} className={`col ${s.tone}`} d={col(gx + si * (bw + 2), c.values[si]!)} /> : null))}
              {c.values[0] ? (
                <text className="axis value" x={gx + bw / 2} y={pad.t + ih - ((c.values[0] ?? 0) / top) * ih - 6} textAnchor="middle">
                  {c.values[0]}
                </text>
              ) : null}
              <text className="axis" x={pad.l + ci * slot + slot / 2} y={h - 6} textAnchor="middle">
                {c.label}
              </text>
            </g>
          );
        })}
      </svg>
      <TipBox tip={tip} />
    </div>
  );
}

/** One headline figure with an optional comparison to the term before. */
export function Figure({ label, value, before, unit = '%', note, to, better = 'up' }: { label: string; value: number | null; before?: number | null; unit?: string; note?: string; to?: string; better?: 'up' | 'down' }) {
  const diff = value !== null && before !== null && before !== undefined ? Math.round((value - before) * 10) / 10 : null;
  const good = diff === null || diff === 0 ? null : better === 'up' ? diff > 0 : diff < 0;
  const body = (
    <>
      <span className="mono">{label}</span>
      <b>{fmt(value, unit) === 'no figure' ? 'None yet' : fmt(value, unit)}</b>
      <span className="muted small">
        {diff !== null && diff !== 0 && (
          <span className={good ? 'delta good' : 'delta bad'}>
            {diff > 0 ? 'Up' : 'Down'} {fmt(Math.abs(diff), unit === '%' ? ' points' : unit)} on last term.{' '}
          </span>
        )}
        {diff === 0 && 'Same as last term. '}
        {note}
      </span>
    </>
  );
  return to ? (
    <Link to={to} className="stat">
      {body}
    </Link>
  ) : (
    <div className="stat">{body}</div>
  );
}
