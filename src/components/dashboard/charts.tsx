// Display-only dashboard charts. They receive precomputed numbers and never touch data.
import { number } from '@/lib/format';

export interface BarPoint { key: string; label: string; value: number; hint: string }

export function AttendanceBars({ points }: { points: BarPoint[] }) {
  return <div className="chart-bars" dir="ltr" role="img" aria-label={points.map(point => `${point.label}: ${point.hint}`).join('، ')}>
    <div className="chart-bars-axis" aria-hidden="true">{[100, 75, 50, 25, 0].map(tick => <span key={tick}>{tick}%</span>)}</div>
    <div className="chart-bars-plot">
      {points.map(point => <div className="chart-bar" key={point.key} title={point.hint}>
        <div className="chart-bar-track"><span className={point.value >= 75 ? 'chart-bar-fill strong' : 'chart-bar-fill'} style={{ height: `${Math.max(point.value, 2)}%` }}/></div>
        <span className="chart-bar-label" dir="ltr">{point.label}</span>
      </div>)}
    </div>
  </div>;
}

export function AttendanceGauge({ rate, present, unresolved, absent }: { rate: number; present: number; unresolved: number; absent: number }) {
  const clamped = Math.min(Math.max(rate, 0), 100);
  // Half circle from left to right; RTL does not affect SVG geometry.
  const radius = 80; const length = Math.PI * radius;
  const angle = Math.PI * (1 - clamped / 100);
  const dot = { x: 100 + radius * Math.cos(angle), y: 100 - radius * Math.sin(angle) };
  return <div className="chart-gauge">
    <svg viewBox="0 0 200 112" role="img" aria-label={`نسبة الحضور ${clamped}%`}>
      <path className="chart-gauge-track" d="M20 100 A80 80 0 0 1 180 100"/>
      <path className="chart-gauge-value" d="M20 100 A80 80 0 0 1 180 100" strokeDasharray={`${length * clamped / 100} ${length}`}/>
      {clamped > 0 && <circle className="chart-gauge-dot" cx={dot.x} cy={dot.y} r="5"/>}
    </svg>
    <div className="chart-gauge-center"><strong>{clamped}<small>%</small></strong><span>نسبة الحضور</span></div>
    <div className="chart-gauge-legend">
      <div><strong>{number(present)}</strong><span>حاضر</span></div>
      <div><strong>{number(unresolved)}</strong><span>غير محسوم</span></div>
      <div><strong>{number(absent)}</strong><span>غائب</span></div>
    </div>
  </div>;
}

export interface TrendPoint { key: string; label: string; value: number }

export function PayrollTrend({ points, format }: { points: TrendPoint[]; format: (value: number) => string }) {
  const width = 320; const height = 140; const pad = 12;
  // Pad the value range so close months still show their differences instead of a flat block.
  const values = points.map(point => point.value);
  const range = (Math.max(...values) - Math.min(...values)) || Math.max(...values) * 0.1 || 1;
  const min = Math.max(Math.min(...values) - range * 0.35, 0);
  const span = Math.max(...values) + range * 0.35 - min || 1;
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((point, index) => ({ x: points.length > 1 ? pad + index * step : width / 2, y: pad + (height - pad * 2) * (1 - (point.value - min) / span) }));
  const line = coords.map((c, index) => `${index ? 'L' : 'M'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const area = coords.length ? `${line} L${coords[coords.length - 1].x.toFixed(1)} ${height} L${coords[0].x.toFixed(1)} ${height} Z` : '';
  return <div className="chart-trend">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={points.map(point => `${point.label}: ${format(point.value)}`).join('، ')}>
      {[0.25, 0.5, 0.75].map(f => <line key={f} className="chart-trend-grid" x1="0" x2={width} y1={height * f} y2={height * f}/>)}
      {area && <path className="chart-trend-area" d={area}/>}
      {line && <path className="chart-trend-line" d={line}/>}
      {coords.map((c, index) => <circle key={points[index].key} className="chart-trend-dot" cx={c.x} cy={c.y} r="4"><title>{`${points[index].label}: ${format(points[index].value)}`}</title></circle>)}
    </svg>
    <div className="chart-trend-labels" dir="ltr">{points.map(point => <span key={point.key}>{point.label}</span>)}</div>
  </div>;
}
