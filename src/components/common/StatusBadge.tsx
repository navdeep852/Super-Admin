import React from 'react';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const norm = status.toLowerCase();

  let styles = 'bg-slate-500/10 text-slate-400 border-slate-500/20';

  if (norm === 'active' || norm === 'healthy' || norm === 'verified_success' || norm === 'applied' || norm === 'resolved') {
    styles = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
  } else if (norm === 'suspended' || norm === 'failed' || norm === 'down' || norm === 'cancelled' || norm === 'critical') {
    styles = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
  } else if (norm === 'past_due' || norm === 'degraded' || norm === 'waiting on customer' || norm === 'high' || norm === 'requires_support_review') {
    styles = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
  } else if (norm === 'trialing' || norm === 'in progress' || norm === 'reserved' || norm === 'pending' || norm === 'medium') {
    styles = 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
  } else if (norm === 'refunded' || norm === 'expired' || norm === 'inactive' || norm === 'low') {
    styles = 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${sizeClasses} ${styles}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {status}
    </span>
  );
};

