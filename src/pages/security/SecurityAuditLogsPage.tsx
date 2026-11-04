import React, { useState } from 'react';
import {
  ShieldCheck,
  Eye,
  FileCode,
  Lock,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { SearchInput } from '../../components/common/SearchInput';
import { Drawer } from '../../components/common/Drawer';
import { mockAuditLogs } from '../../data/mockAuditLogs';
import { AuditLogEntry } from '../../types';
import { formatDateTime } from '../../utils';

export const SecurityAuditLogsPage: React.FC = () => {
  const [logs] = useState<AuditLogEntry[]>(mockAuditLogs);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const filteredLogs = logs.filter((l) => {
    const matchesSearch =
      l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.adminEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.targetId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.reason.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAction = actionFilter === 'all' || l.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'action',
      header: 'Privileged Action',
      sortable: true,
      render: (l) => (
        <div>
          <div className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            {l.action}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">Resource: {l.targetResource} ({l.targetId})</div>
        </div>
      ),
    },
    {
      key: 'adminEmail',
      header: 'Acting Administrator',
      sortable: true,
      render: (l) => (
        <div>
          <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
            {l.adminEmail}
          </span>
          <span className="block text-[10px] text-slate-400 capitalize">{l.adminRole.replace('_', ' ')}</span>
        </div>
      ),
    },
    {
      key: 'clientIp',
      header: 'Client Origin',
      sortable: true,
      render: (l) => (
        <span className="font-mono text-xs text-slate-500">
          {l.clientIp}
        </span>
      ),
    },
    {
      key: 'assertionNonce',
      header: 'GCAP Assertion',
      render: (l) => (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          <ShieldCheck className="w-3 h-3" />
          {l.assertionNonce.slice(0, 10)}...
        </span>
      ),
    },
    {
      key: 'timestamp',
      header: 'Timestamp (UTC)',
      sortable: true,
      render: (l) => (
        <span className="text-xs text-slate-400 font-mono">{formatDateTime(l.timestamp)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Inspect',
      align: 'right',
      render: (l) => (
        <button
          onClick={() => setSelectedLog(l)}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          title="Inspect Cryptographic Log Record"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <PageContainer
      title="Security & Immutable Audit Logs"
      subtitle="Phase 2.6 Gateway Cryptographic Assertion Protocol (GCAP) verified audit stream with non-repudiation."
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 font-medium">
            <Lock className="w-3 h-3" />
            Append-Only Vault
          </span>
        </div>
      }
    >
      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by action, administrator, or target ID..."
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300"
          >
            <option value="all">All Action Types</option>
            <option value="SUSPEND_WORKSPACE">SUSPEND_WORKSPACE</option>
            <option value="PLAN_OVERRIDE">PLAN_OVERRIDE</option>
            <option value="COUPON_CREATE">COUPON_CREATE</option>
            <option value="SETTINGS_UPDATE">SETTINGS_UPDATE</option>
          </select>
        </div>
      </div>

      {/* Audit Table */}
      <div className="mt-4">
        <DataTable
          data={filteredLogs}
          columns={columns}
          keyExtractor={(l) => l.id}
          pageSize={8}
          emptyMessage="No audit log entries matching criteria."
        />
      </div>

      {/* DETAIL DRAWER: Inspect GCAP Signature & Record Payload */}
      <Drawer
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Audit Record Cryptographic Inspection"
        subtitle={`Audit ID: ${selectedLog?.id}`}
        width="xl"
      >
        {selectedLog && (
          <div className="space-y-6 text-xs">
            {/* Action Summary Card */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Action Name</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{selectedLog.action}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                <div>
                  <span className="text-slate-400 block text-[10px]">Administrator</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{selectedLog.adminEmail}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Client Origin</span>
                  <span className="font-mono">{selectedLog.clientIp}</span>
                </div>
              </div>
            </div>

            {/* GCAP Nonce Details */}
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                Gateway Cryptographic Assertion Protocol (GCAP) Verified
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300">
                This transaction carried a single-use signed nonce verified by the Supabase backend within the anti-replay window.
              </p>
              <div className="p-2.5 rounded bg-slate-950 font-mono text-[10px] text-emerald-400 break-all">
                Nonce: {selectedLog.assertionNonce}
              </div>
            </div>

            {/* Justification & Reason */}
            <div>
              <span className="text-slate-400 block text-[10px] mb-1 uppercase font-bold">Admin Justification</span>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300">
                {selectedLog.reason}
              </div>
            </div>

            {/* Raw Details JSON */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <FileCode className="w-3.5 h-3.5" />
                Recorded State Change Details
              </div>
              <pre className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-200 font-mono text-[11px] overflow-x-auto">
                {JSON.stringify(selectedLog.details, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </PageContainer>
  );
};
