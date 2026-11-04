import React, { useState } from 'react';
import {
  CheckCircle2,
  Server,
  Zap,
  Clock,
  ShieldCheck,
  RefreshCw,
  Database,
  Radio,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { StatusBadge } from '../../components/common/StatusBadge';
import { mockSystemServices, mockIncidents } from '../../data/mockSystemHealth';
import { SystemServiceHealth } from '../../types';
import { formatDate } from '../../utils';

export const SystemHealthPage: React.FC = () => {
  const [services] = useState<SystemServiceHealth[]>(mockSystemServices);
  const [incidents] = useState(mockIncidents);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  const getServiceIcon = (name: string) => {
    if (name.includes('Database') || name.includes('PostgreSQL')) return Database;
    if (name.includes('Gateway') || name.includes('Payment')) return Zap;
    if (name.includes('Webhook')) return Radio;
    if (name.includes('GCAP') || name.includes('Audit')) return ShieldCheck;
    return Server;
  };

  return (
    <PageContainer
      title="System Health & Infrastructure Telemetry"
      subtitle="Operational status of backend clusters, cryptographic verifiers, and payment webhooks."
      actions={
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 flex items-center gap-1.5 transition-colors shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-500' : ''}`} />
          Run Health Probe
        </button>
      }
    >
      {/* Global Status Banner */}
      <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              All Systems Operational & Healthy
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Overall Platform Availability: <strong>99.98%</strong> over the past 90 days.
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Telemetry Active
        </div>
      </div>

      {/* Microservices Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        {services.map((svc) => {
          const Icon = getServiceIcon(svc.name);
          return (
            <div
              key={svc.name}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {svc.name}
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Probe Latency: {svc.latencyMs}ms
                    </span>
                  </div>
                </div>
                <StatusBadge status={svc.status} />
              </div>

              {/* Telemetry Metrics */}
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block">Availability</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {svc.uptime99}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Last Probe</span>
                  <span className="font-mono text-slate-500 text-[11px]">
                    {formatDate(svc.lastChecked)}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500">
                {svc.details}
              </div>

              {/* Latency Bar Indicator */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Latency Health</span>
                  <span className="font-mono text-emerald-500 font-semibold">{svc.latencyMs} ms</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${Math.min(100, (svc.latencyMs / 100) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Incident Post-Mortem Stream */}
      <div className="mt-8 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Historical Incident Post-Mortems & Resolutions
          </h3>
        </div>
        <div className="space-y-4">
          {incidents.map((inc) => (
            <div
              key={inc.id}
              className="p-4 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30 text-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>{inc.title}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    {inc.severity}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {formatDate(inc.startedAt)} • {inc.service}
                </div>
              </div>
              <div className="text-slate-600 dark:text-slate-300">
                <strong className="text-slate-800 dark:text-slate-200">Impact & Mitigation: </strong>
                {inc.impact}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageContainer>
  );
};
