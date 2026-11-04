import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '../../utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  change?: number;
  changeLabel?: string;
  variant?: 'default' | 'emerald' | 'amber' | 'blue' | 'purple';
  badge?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  change,
  changeLabel,
  variant = 'default',
  badge,
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'emerald':
        return 'border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40';
      case 'amber':
        return 'border-amber-500/20 bg-amber-500/5 hover:border-amber-500/40';
      case 'blue':
        return 'border-blue-500/20 bg-blue-500/5 hover:border-blue-500/40';
      case 'purple':
        return 'border-purple-500/20 bg-purple-500/5 hover:border-purple-500/40';
      default:
        return 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700';
    }
  };

  const getIconColor = () => {
    switch (variant) {
      case 'emerald':
        return 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10';
      case 'amber':
        return 'text-amber-500 dark:text-amber-400 bg-amber-500/10';
      case 'blue':
        return 'text-blue-500 dark:text-blue-400 bg-blue-500/10';
      case 'purple':
        return 'text-purple-500 dark:text-purple-400 bg-purple-500/10';
      default:
        return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800';
    }
  };

  return (
    <div
      className={cn(
        'rounded-xl border p-5 transition-all duration-200 shadow-xs backdrop-blur-xs',
        getVariantStyles()
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {title}
            </span>
            {badge && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {badge}
              </span>
            )}
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono">
            {value}
          </div>
        </div>
        <div className={cn('p-2.5 rounded-lg shrink-0', getIconColor())}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {(change !== undefined || subtitle) && (
        <div className="mt-3 flex items-center justify-between text-xs pt-3 border-t border-slate-100 dark:border-slate-800/80">
          {change !== undefined ? (
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-semibold text-xs px-1.5 py-0.5 rounded',
                  change >= 0
                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
                    : 'text-rose-700 dark:text-rose-400 bg-rose-500/10'
                )}
              >
                {change >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {change >= 0 ? `+${change}%` : `${change}%`}
              </span>
              {changeLabel && (
                <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                  {changeLabel}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-500 dark:text-slate-400 text-[11px]">
              {subtitle}
            </span>
          )}
          {change !== undefined && subtitle && (
            <span className="text-slate-400 dark:text-slate-500 text-[10px]">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

