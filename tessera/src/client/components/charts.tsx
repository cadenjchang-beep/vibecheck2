import { useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip } from './ui/controls';

export interface Bar {
  key: string;
  /** Short label under the bar. */
  label: string;
  /** Full description for the tooltip, screen readers and the table. */
  title: string;
  value: number;
  /** The one bar worth a direct label (for example, today). */
  emphasis?: boolean;
}

/** A round number at or above `value`, so the top gridline is easy to read. */
function niceMax(value: number): number {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}

interface BarChartProps {
  bars: Bar[];
  /** Turns a value into the phrase shown in tooltips, e.g. "12 cards". */
  format: (value: number) => string;
  /** A reference level drawn across the plot, with its label. */
  goal?: { value: number; label: string };
  /** One-sentence summary for screen readers. */
  summary: string;
  columns: [string, string];
  empty?: ReactNode;
  className?: string;
}

/**
 * A single-series column chart: thin bars from one baseline, quiet gridlines,
 * the value on hover or focus, one direct label, and a table view of the same
 * numbers. One series, so there is no legend: the heading above names it.
 */
export function BarChart({ bars, format, goal, summary, columns, empty, className }: BarChartProps) {
  const { t } = useI18n();
  const [table, setTable] = useState(false);
  const peak = Math.max(...bars.map((b) => b.value), goal?.value ?? 0);
  const max = niceMax(peak);
  const ticks = [max, max / 2, 0];

  if (peak === 0 && empty) return <div className={className}>{empty}</div>;

  return (
    <div className={className}>
      {table ? (
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="py-1.5 text-start font-semibold">
                {columns[0]}
              </th>
              <th scope="col" className="py-1.5 text-end font-semibold">
                {columns[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.key} className="border-b border-border last:border-0">
                <th scope="row" className="py-1.5 text-start font-normal">
                  {bar.title}
                </th>
                <td className="py-1.5 text-end font-semibold tabular-nums">{bar.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex gap-2">
          <div className="flex h-44 flex-col justify-between pb-6 text-end text-xs text-muted-foreground tabular-nums" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
                {tick}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <p className="sr-only">{summary}</p>
            {/* Plot area: hairline gridlines behind, bars from the baseline. */}
            <div className="relative h-[9.5rem]">
              {ticks.map((tick) => (
                <span key={tick} aria-hidden="true" className="absolute inset-x-0 h-px bg-border" style={{ bottom: `${(tick / max) * 100}%` }} />
              ))}
              {goal && goal.value > 0 ? (
                <span aria-hidden="true" className="absolute inset-x-0 z-10 h-px bg-muted-foreground" style={{ bottom: `${(goal.value / max) * 100}%` }}>
                  <span className="absolute end-0 bottom-0.5 rounded bg-card px-1 text-xs text-muted-foreground">{goal.label}</span>
                </span>
              ) : null}
              <ul className="absolute inset-0 flex items-end">
                {bars.map((bar) => (
                  <li key={bar.key} className="flex h-full min-w-0 flex-1 justify-center">
                    <Tooltip label={`${bar.title}: ${format(bar.value)}`}>
                      {/* The whole column is the hit target, not just the thin bar. */}
                      <span tabIndex={0} role="img" aria-label={`${bar.title}: ${format(bar.value)}`} className="group flex h-full w-full flex-col items-center justify-end rounded-md">
                        {bar.emphasis && bar.value > 0 ? <span className="mb-1 text-xs font-bold tabular-nums">{bar.value}</span> : null}
                        <span
                          className="w-full max-w-6 rounded-t bg-chart-1 transition-[height,opacity] duration-300 group-hover:opacity-80 group-focus-visible:opacity-80"
                          style={{ height: `${(bar.value / max) * 100}%`, minHeight: bar.value > 0 ? 2 : 0 }}
                        />
                      </span>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </div>
            <ul className="mt-1.5 flex" aria-hidden="true">
              {bars.map((bar) => (
                <li key={bar.key} className={cn('min-w-0 flex-1 truncate text-center text-xs', bar.emphasis ? 'font-bold text-foreground' : 'text-muted-foreground')}>
                  {bar.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <Button variant="link" size="sm" className="mt-2" onClick={() => setTable((v) => !v)}>
        {table ? t('stats.showChart') : t('stats.showTable')}
      </Button>
    </div>
  );
}

const HEAT = ['bg-secondary', 'bg-chart-1/25', 'bg-chart-1/50', 'bg-chart-1/75', 'bg-chart-1'];

/** A calendar grid: one cell per day, one hue from light to dark for "more". */
export function Heatmap({ days, format, summary }: { days: Array<{ day: string; value: number; title: string }>; format: (value: number) => string; summary: string }) {
  const { t } = useI18n();
  const max = Math.max(1, ...days.map((d) => d.value));
  const level = (value: number) => (value === 0 ? 0 : Math.min(4, Math.ceil((value / max) * 4)));
  return (
    <div>
      <div role="img" aria-label={summary} className="grid grid-flow-col grid-rows-7 justify-start gap-0.5">
        {days.map((d) => (
          <span key={d.day} title={`${d.title}: ${format(d.value)}`} className={cn('size-3.5 rounded-[3px] sm:size-4', HEAT[level(d.value)])} />
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground" aria-hidden="true">
        {t('stats.heatmapLess')}
        {HEAT.map((cls) => (
          <span key={cls} className={cn('size-3 rounded-[3px]', cls)} />
        ))}
        {t('stats.heatmapMore')}
      </p>
    </div>
  );
}
