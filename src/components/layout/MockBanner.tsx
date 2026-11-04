import React, { useState, useEffect } from 'react';
import { ShieldCheck, CheckCircle2, AlertTriangle, Radio, X } from 'lucide-react';
import { adminGatewayClient, GatewayHealthStatus } from '../../services/adminGatewayClient';

export const MockBanner: React.FC = () => {
  const [health, setHealth] = useState<GatewayHealthStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const probe = async () => {
      try {
        const res = await adminGatewayClient.checkHealth();
        if (mounted) {
          setHealth(res);
          setIsInitialLoading(false);
        }
      } catch {
        if (mounted) {
          setIsInitialLoading(false);
        }
      }
    };
    probe();
    const interval = setInterval(probe, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (dismissed || isInitialLoading) return null;

  const isLive = health?.status === 'operational' || health?.status === 'degraded' || (health as any)?.ok === true || (health as any)?.status === 'ok';

  if (isLive) {
    return (
      <div className="bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/15 border-b border-emerald-500/30 text-emerald-950 dark:text-emerald-200 px-4 py-2 text-xs flex items-center justify-between backdrop-blur-xs relative z-40">
        <div className="flex items-center gap-2 overflow-hidden text-ellipsis">
          <span className="flex items-center justify-center p-1 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
            <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-500" />
          </span>
          <span className="font-semibold text-emerald-800 dark:text-emerald-300">
            Live Staging Gateway Connected:
          </span>
          <span className="hidden sm:inline text-slate-700 dark:text-slate-300">
            Serving live multi-tenant state from Supabase <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">{health?.stagingProjectRef || (health as any)?.projectRef || 'vlbhxcajphyjkeueubud'}</span> (AWS eu-west-1).
          </span>
          <span className="hidden md:inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
            <ShieldCheck className="w-3 h-3" />
            Production Air-Gap Active
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 hidden lg:inline flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            BFF Uptime: {(health as any)?.uptimeSeconds || (health as any)?.services?.gatewayBff?.uptimeSeconds || 0}s
          </span>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded hover:bg-emerald-500/20 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            title="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-emerald-500/15 border-b border-amber-500/30 text-amber-900 dark:text-amber-200 px-4 py-2 text-xs flex items-center justify-between backdrop-blur-xs relative z-40">
      <div className="flex items-center gap-2 overflow-hidden text-ellipsis">
        <span className="flex items-center justify-center p-1 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5" />
        </span>
        <span className="font-semibold text-amber-800 dark:text-amber-300">
          Super Admin Mock Simulation Mode:
        </span>
        <span className="hidden sm:inline text-slate-700 dark:text-slate-300">
          Gateway BFF offline on port 3002. Operating in simulated offline mode.
        </span>
        <span className="hidden md:inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 font-medium">
          <ShieldCheck className="w-3 h-3" />
          Production VISTAAR database untouched
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded hover:bg-amber-500/20 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          title="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
