import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { Overview, HealthCheck } from './types';
import { formatBytes, formatUptime } from './format';

const SECTION = 'rounded-lg border border-stone-200 bg-white p-4 md:p-5';
const HEADING = 'text-sm font-semibold text-stone-900 mb-3';

const CHECK_STATE: Record<HealthCheck['status'], { label: string; icon: typeof CheckCircle2; tone: string }> = {
  fail: { label: 'Failing', icon: XCircle, tone: 'text-red-600' },
  warn: { label: 'Warning', icon: AlertTriangle, tone: 'text-amber-700' },
  pass: { label: 'OK', icon: CheckCircle2, tone: 'text-emerald-600' },
};
const SEVERITY: HealthCheck['status'][] = ['fail', 'warn', 'pass'];

function checkSummary(checks: HealthCheck[]): string {
  const count = (status: HealthCheck['status']) => checks.filter((c) => c.status === status).length;
  const [failing, warning, passing] = SEVERITY.map(count);
  if (failing === 0 && warning === 0) return `All ${passing} checks passing`;
  return [
    failing > 0 && `${failing} failing`,
    warning > 0 && `${warning} warning`,
    `${passing} passing`,
  ].filter(Boolean).join(', ');
}

const Meter: React.FC<{ label: string; used: number; total: number }> = ({ label, used, total }) => {
  const percent = total > 0 ? Math.round((used / total) * 100) : 0;
  const tone = percent > 85 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-stone-600">{label}</span>
        <span className="text-lg font-semibold text-stone-900 tabular-nums">{percent}%</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-stone-200" aria-hidden="true">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="mt-1 text-xs text-stone-500">{`${formatBytes(used)} of ${formatBytes(total)}`}</p>
    </div>
  );
};

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-1.5">
    <dt className="text-sm text-stone-600">{label}</dt>
    <dd className="text-sm font-medium text-stone-900 tabular-nums text-right">{children}</dd>
  </div>
);

export const OverviewTab: React.FC<{ data: Overview }> = ({ data }) => {
  const { version, system, database } = data;
  const checks = [...data.checks].sort((a, b) => SEVERITY.indexOf(a.status) - SEVERITY.indexOf(b.status));

  return (
    <div className="space-y-4">
      <section className={SECTION} aria-labelledby="devdash-checks">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h3 id="devdash-checks" className="text-sm font-semibold text-stone-900">Health checks</h3>
          <p className="text-sm text-stone-600">{checkSummary(data.checks)}</p>
        </div>
        <ul className="divide-y divide-stone-100">
          {checks.map((check) => {
            const state = CHECK_STATE[check.status];
            const Icon = state.icon;
            return (
              <li key={check.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:gap-4">
                <span className={`flex items-center gap-1.5 text-sm font-medium sm:w-24 ${state.tone}`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {state.label}
                </span>
                <span className="text-sm font-medium text-stone-900 sm:w-64">{check.label}</span>
                <span className="text-sm text-stone-700 flex-1 break-words">{check.value}</span>
                <span className="text-xs text-stone-500 sm:text-right">{check.threshold}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className={SECTION} aria-labelledby="devdash-version">
          <h3 id="devdash-version" className={HEADING}>Version</h3>
          <dl className="divide-y divide-stone-100">
            <Fact label="Frontend">{version.frontend}</Fact>
            <Fact label="Backend">{version.backend}</Fact>
            <Fact label="Node">{version.node}</Fact>
            <Fact label="Environment">{version.environment}</Fact>
            <Fact label="Backend uptime">{formatUptime(version.uptimeSeconds)}</Fact>
          </dl>
        </section>

        <section className={SECTION} aria-labelledby="devdash-system">
          <h3 id="devdash-system" className={HEADING}>System</h3>
          <div className="space-y-4">
            <Meter label="Memory" used={system.memory.usedBytes} total={system.memory.totalBytes} />
            {system.disk ? (
              <Meter label="Disk (uploads volume)" used={system.disk.usedBytes} total={system.disk.totalBytes} />
            ) : (
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-stone-600">Disk (uploads volume)</span>
                <span className="text-sm text-stone-500">Unavailable</span>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-stone-600">CPU load (1 min)</span>
              <span>
                <span className="text-lg font-semibold text-stone-900 tabular-nums">{system.cpu.load1.toFixed(2)}</span>
                <span className="ml-2 text-xs text-stone-500">{`${system.cpu.cores} cores`}</span>
              </span>
            </div>
          </div>
        </section>

        <section className={SECTION} aria-labelledby="devdash-database">
          <h3 id="devdash-database" className={HEADING}>Database</h3>
          <dl className="divide-y divide-stone-100">
            <Fact label="Size">{formatBytes(database.sizeBytes)}</Fact>
            <Fact label="Connections">{`${database.connections} of ${database.maxConnections}`}</Fact>
          </dl>
          <h4 className="mt-4 mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Largest tables</h4>
          <dl className="divide-y divide-stone-100">
            {database.tables.map((table) => (
              <div key={table.name} className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="text-sm font-mono text-stone-700 truncate">{table.name}</dt>
                <dd className="text-sm text-stone-900 tabular-nums">{formatBytes(table.sizeBytes)}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
};
