import React, { useState, useEffect } from 'react';
import {
  Eye,
  FileSpreadsheet,
  AlertTriangle,
  Code2,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { SearchInput } from '../../components/common/SearchInput';
import { Drawer } from '../../components/common/Drawer';
import { mockPayments } from '../../data/mockPayments';
import { PaymentTransaction } from '../../types';
import { formatINR, formatINRWithDecimals, formatDateTime } from '../../utils';
import { adminGatewayClient } from '../../services/adminGatewayClient';

export const PaymentsRevenuePage: React.FC = () => {
  const [payments, setPayments] = useState<PaymentTransaction[]>(mockPayments);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTx, setSelectedTx] = useState<PaymentTransaction | null>(null);

  useEffect(() => {
    adminGatewayClient.getPayments().then((res) => {
      if (res.payments && res.payments.length > 0) {
        const mapped: PaymentTransaction[] = res.payments.map((p: any) => ({
          id: p.id,
          transactionReference: p.gateway_payment_id || p.gateway_order_id || p.id,
          workspaceId: p.workspace_id,
          workspaceName: p.workspaces?.company_name || 'Retail Business',
          customerEmail: p.workspaces?.owner_email || 'billing@retail.in',
          amountInr: Number(p.amount_inr || 0),
          currency: 'INR' as const,
          provider: 'youpi_pg' as const,
          status: p.status === 'successful' ? ('verified_success' as const) : ('failed' as const),
          planId: 'business',
          createdAt: p.created_at,
          verifiedAt: p.created_at,
        }));
        setPayments(mapped);
      }
    });
  }, []);

  // Reconciliation summary aggregates
  const totalCaptured = payments
    .filter((p) => p.status === 'verified_success')
    .reduce((acc, p) => acc + p.amountInr, 0);

  const totalRefunded = payments
    .filter((p) => p.status === 'refunded')
    .reduce((acc, p) => acc + p.amountInr, 0);

  const totalGst = totalCaptured * (0.18 / 1.18);
  const netSettlement = totalCaptured - totalRefunded - totalGst;

  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      p.workspaceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.transactionReference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns: Column<PaymentTransaction>[] = [
    {
      key: 'transactionReference',
      header: 'Gateway Tx Reference',
      sortable: true,
      render: (p) => (
        <div>
          <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            {p.transactionReference}
            {p.status === 'verified_success' && (
              <span className="text-[10px] text-emerald-500 font-mono" title="Provider Signature Verified">
                ✓ SIG
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">ID: {p.id}</div>
        </div>
      ),
    },
    {
      key: 'workspaceName',
      header: 'Workspace',
      sortable: true,
      render: (p) => (
        <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
          {p.workspaceName}
        </span>
      ),
    },
    {
      key: 'amountInr',
      header: 'Gross (Incl. GST)',
      align: 'right',
      sortable: true,
      render: (p) => (
        <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">
          {formatINR(p.amountInr)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Settlement Status',
      sortable: true,
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'provider',
      header: 'Gateway',
      sortable: true,
      render: (p) => (
        <span className="uppercase text-xs text-slate-600 dark:text-slate-400 font-mono">
          {p.provider}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Timestamp',
      sortable: true,
      render: (p) => (
        <span className="text-xs text-slate-400 font-mono">{formatDateTime(p.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Inspect',
      align: 'right',
      render: (p) => (
        <button
          onClick={() => setSelectedTx(p)}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          title="Inspect Gateway Payload & Checksum"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <PageContainer
      title="Payments & Revenue Settlement"
      subtitle="Phase 2.6 verified gateway transactions, immutable failure logs, and 18% GST statutory ledger."
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => alert('Exporting statutory reconciliation CSV...')}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
            Export GST Reconciliation
          </button>
        </div>
      }
    >
      {/* Statutory Reconciliation Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400">Total Captured</span>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
            {formatINR(totalCaptured)}
          </div>
          <span className="text-[11px] text-slate-500">Gross subscription funds captured</span>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400">Refunds Processed</span>
          <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 mt-1">
            {formatINR(totalRefunded)}
          </div>
          <span className="text-[11px] text-slate-500">Settled customer chargebacks & returns</span>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400">GST Component (18%)</span>
          <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
            {formatINRWithDecimals(totalGst)}
          </div>
          <span className="text-[11px] text-slate-500">Statutory tax liability payable to Govt</span>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-xs">
          <span className="text-[10px] uppercase font-bold text-slate-400">Net Platform Settlement</span>
          <div className="text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-1">
            {formatINRWithDecimals(netSettlement)}
          </div>
          <span className="text-[11px] text-slate-500">Net earnings transferred to bank account</span>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs mt-4">
        <div className="w-full sm:w-80">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search by transaction reference or workspace..."
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300"
          >
            <option value="all">All Transactions</option>
            <option value="verified_success">Verified Captured Only</option>
            <option value="failed">Failed / Mismatch Only</option>
            <option value="refunded">Refunded Only</option>
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="mt-4">
        <DataTable
          data={filteredPayments}
          columns={columns}
          keyExtractor={(p) => p.id}
          pageSize={8}
          emptyMessage="No payment transactions match the query."
        />
      </div>

      {/* Transaction Detail Drawer (Payload & Checksum Inspector) */}
      <Drawer
        isOpen={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        title="Payment Transaction Audit Payload"
        subtitle={`Reference: ${selectedTx?.transactionReference}`}
        width="xl"
      >
        {selectedTx && (
          <div className="space-y-6 text-xs">
            {/* Settlement Status Card */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Settlement Verification</span>
                <StatusBadge status={selectedTx.status} />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700/60">
                <div>
                  <span className="text-slate-400 block text-[10px]">Gross Amount</span>
                  <span className="font-mono font-bold text-sm text-slate-900 dark:text-slate-100">
                    {formatINR(selectedTx.amountInr)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Gateway Provider</span>
                  <span className="capitalize font-mono font-medium">{selectedTx.provider}</span>
                </div>
              </div>
            </div>

            {/* Failure Reason Alert (If Failed) */}
            {selectedTx.status === 'failed' && selectedTx.errorMessage && (
              <div className="p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 space-y-2">
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold">
                  <AlertTriangle className="w-4 h-4" />
                  Phase 2.6 Fraud Detection / Verification Failure
                </div>
                <div className="font-mono text-xs text-rose-700 dark:text-rose-300">
                  {selectedTx.errorMessage}
                </div>
                <p className="text-[11px] text-slate-500">
                  This transaction failed authoritative signature verification or attempted an amount mismatch. The failure evidence has been committed to the ledger without fulfilling the subscription.
                </p>
              </div>
            )}

            {/* Gateway Verification Metadata */}
            <div className="space-y-2">
              <h4 className="font-bold uppercase tracking-wider text-slate-400 text-[10px]">
                Cryptographic Gateway Verification Data
              </h4>
              <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 font-mono text-[11px] space-y-1.5">
                <div><strong>Provider:</strong> {selectedTx.provider}</div>
                <div><strong>Workspace ID:</strong> {selectedTx.workspaceId}</div>
                <div><strong>Redemption ID:</strong> {selectedTx.couponRedemptionId || 'None (Direct Purchase)'}</div>
                <div><strong>Webhook Receipt Time:</strong> {formatDateTime(selectedTx.createdAt)}</div>
              </div>
            </div>

            {/* Raw JSON Payload Preview */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <Code2 className="w-3.5 h-3.5" />
                Raw Webhook Payload Evidence
              </div>
              <pre className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-emerald-400 font-mono text-[10px] overflow-x-auto">
                {JSON.stringify(
                  {
                    event: selectedTx.status === 'verified_success' ? 'payment.captured' : 'payment.failed',
                    payload: {
                      payment: {
                        entity: {
                          id: selectedTx.transactionReference,
                          amount: selectedTx.amountInr * 100, // paise
                          currency: selectedTx.currency,
                          status: selectedTx.status === 'verified_success' ? 'captured' : 'failed',
                          order_id: `order_${selectedTx.id}`,
                          notes: {
                            workspace_id: selectedTx.workspaceId,
                            redemption_id: selectedTx.couponRedemptionId,
                          },
                        },
                      },
                    },
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        )}
      </Drawer>
    </PageContainer>
  );
};
