import React, { useState } from 'react';
import {
  CheckCircle2,
  Send,
  Eye,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { DataTable, Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Drawer } from '../../components/common/Drawer';
import { SearchInput } from '../../components/common/SearchInput';
import { mockSupportTickets } from '../../data/mockSupport';
import { SupportTicket } from '../../types';
import { formatDate, formatDateTime } from '../../utils';
import { useAdminAuth } from '../../context/AdminAuthContext';

export const SupportManagementPage: React.FC = () => {
  const { currentAdmin } = useAdminAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>(mockSupportTickets);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.workspaceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.contactName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTicket) return;

    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === selectedTicket.id) {
          return {
            ...t,
            status: 'In Progress' as const,
            lastMessageSnippet: `Support response: ${replyMessage.trim()}`,
            updatedAt: new Date().toISOString(),
          };
        }
        return t;
      })
    );

    setSelectedTicket((prev) =>
      prev
        ? {
            ...prev,
            status: 'In Progress' as const,
            lastMessageSnippet: `Support response: ${replyMessage.trim()}`,
            updatedAt: new Date().toISOString(),
          }
        : null
    );

    setReplyMessage('');
  };

  const handleResolveTicket = (ticketId: string) => {
    setTickets((prev) =>
      prev.map((t) => {
        if (t.id === ticketId) return { ...t, status: 'Resolved' as const, updatedAt: new Date().toISOString() };
        return t;
      })
    );
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket((prev) => (prev ? { ...prev, status: 'Resolved' as const } : null));
    }
  };

  const columns: Column<SupportTicket>[] = [
    {
      key: 'subject',
      header: 'Subject & Ticket',
      sortable: true,
      render: (t) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            {t.subject}
            <span
              className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${
                t.priority === 'Critical'
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : t.priority === 'High'
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {t.priority}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono">ID: {t.ticketNumber}</div>
        </div>
      ),
    },
    {
      key: 'workspaceName',
      header: 'Workspace',
      sortable: true,
      render: (t) => (
        <div>
          <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{t.workspaceName}</div>
          <div className="text-[11px] text-slate-400">{t.contactName}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Ticket Status',
      sortable: true,
      render: (t) => <StatusBadge status={t.status} />,
    },
    {
      key: 'assignedTo',
      header: 'Assigned Agent',
      sortable: true,
      render: (t) => (
        <span className="text-xs text-slate-600 dark:text-slate-400">
          {t.assignedTo || 'Unassigned'}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Last Active',
      sortable: true,
      render: (t) => (
        <span className="text-xs text-slate-400 font-mono">{formatDate(t.updatedAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (t) => (
        <button
          onClick={() => setSelectedTicket(t)}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
          title="Open Ticket Conversation"
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <PageContainer
      title="Support & Customer Inquiries"
      subtitle="Resolve merchant escalations, payment issues, and workspace configuration tickets."
      actions={
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            Open Tickets: <strong className="text-amber-500">{tickets.filter(t => t.status === 'Open').length}</strong>
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
            placeholder="Search tickets by subject, workspace, or customer..."
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300"
          >
            <option value="all">All Ticket Statuses</option>
            <option value="Open">Open Only</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Waiting on Customer">Waiting on Customer</option>
          </select>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="mt-4">
        <DataTable
          data={filteredTickets}
          columns={columns}
          keyExtractor={(t) => t.id}
          onRowClick={(t) => setSelectedTicket(t)}
          pageSize={8}
          emptyMessage="No tickets found matching the filter."
        />
      </div>

      {/* TICKET CONVERSATION DRAWER */}
      <Drawer
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        title={selectedTicket?.subject || 'Ticket Conversation'}
        subtitle={`Workspace: ${selectedTicket?.workspaceName} • Contact: ${selectedTicket?.contactName} (${selectedTicket?.contactEmail})`}
        width="xl"
      >
        {selectedTicket && (
          <div className="flex flex-col h-full space-y-4">
            {/* Ticket Header & Status bar */}
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedTicket.status} />
                <span className="text-slate-400">Category: <strong className="text-slate-700 dark:text-slate-300">{selectedTicket.category}</strong></span>
                <span className="text-slate-400">Priority: <strong className="uppercase text-slate-700 dark:text-slate-300">{selectedTicket.priority}</strong></span>
              </div>
              {selectedTicket.status !== 'Resolved' && (
                <button
                  onClick={() => handleResolveTicket(selectedTicket.id)}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Mark as Resolved
                </button>
              )}
            </div>

            {/* Conversation Messages */}
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[50vh] pr-1">
              <div className="flex flex-col items-start">
                <div className="text-[10px] text-slate-400 mb-1 font-medium flex items-center gap-1.5">
                  <span>{selectedTicket.contactName}</span>
                  <span>•</span>
                  <span>{formatDateTime(selectedTicket.createdAt)}</span>
                </div>
                <div className="p-3 rounded-xl text-xs max-w-[85%] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-200 dark:border-slate-700/60">
                  {selectedTicket.subject}
                </div>
              </div>

              <div className="flex flex-col items-end">
                <div className="text-[10px] text-slate-400 mb-1 font-medium flex items-center gap-1.5">
                  <span>{selectedTicket.assignedTo || currentAdmin?.fullName || 'Support Agent'}</span>
                  <span>•</span>
                  <span>{formatDateTime(selectedTicket.updatedAt)}</span>
                </div>
                <div className="p-3 rounded-xl text-xs max-w-[85%] bg-emerald-600 text-white rounded-tr-none">
                  {selectedTicket.lastMessageSnippet}
                </div>
              </div>
            </div>

            {/* Reply Input */}
            <form onSubmit={handleSendReply} className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Type an official support response..."
                  className="flex-1 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={!replyMessage.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  Reply
                </button>
              </div>
            </form>
          </div>
        )}
      </Drawer>
    </PageContainer>
  );
};
