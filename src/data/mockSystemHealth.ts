import { SystemServiceHealth } from '../types';

export const mockSystemServices: SystemServiceHealth[] = [
  {
    name: 'Supabase PostgreSQL Primary',
    status: 'Healthy',
    latencyMs: 14,
    uptime99: 99.98,
    lastChecked: '2026-11-01T17:15:00Z',
    details: 'Connection pool 24/60 active; replication lag < 12ms; RLS active'
  },
  {
    name: 'Super Admin Gateway BFF (Node.js)',
    status: 'Healthy',
    latencyMs: 28,
    uptime99: 99.95,
    lastChecked: '2026-11-01T17:15:00Z',
    details: 'JWT verification active; GCAP HMAC signing operational; AAL2 enforced'
  },
  {
    name: 'Youpi Payment Gateway Webhook Receiver',
    status: 'Healthy',
    latencyMs: 32,
    uptime99: 99.99,
    lastChecked: '2026-11-01T17:15:00Z',
    details: 'HMAC signature verification enabled; zero queued transit delays'
  },
  {
    name: 'GCAP Nonce Registry & Replay Guard',
    status: 'Healthy',
    latencyMs: 8,
    uptime99: 100.0,
    lastChecked: '2026-11-01T17:15:00Z',
    details: 'Atomic unique constraint verified; cleanup cron active (TTL 5m)'
  },
  {
    name: 'Cloudflare Edge WAF & SSL Ingress',
    status: 'Healthy',
    latencyMs: 12,
    uptime99: 100.0,
    lastChecked: '2026-11-01T17:15:00Z',
    details: 'SSL/TLS 1.3 enforced; DDoS rate limits active on admin.vistaarone.com'
  },
  {
    name: 'Audit Log Immutability Engine',
    status: 'Healthy',
    latencyMs: 6,
    uptime99: 100.0,
    lastChecked: '2026-11-01T17:15:00Z',
    details: 'Trigger trg_protect_platform_audit_logs active; updates/deletes blocked'
  }
];

export const mockIncidents = [
  {
    id: 'inc-01',
    title: 'Payment Gateway Webhook Flapping (Resolved)',
    severity: 'Medium',
    service: 'Youpi PG Webhook Receiver',
    startedAt: '2026-10-18T04:20:00Z',
    resolvedAt: '2026-10-18T04:55:00Z',
    impact: '12 webhooks delayed in transit; all cleanly re-delivered and settled within 24h window.',
    postMortemUrl: '#'
  },
  {
    id: 'inc-02',
    title: 'PostgreSQL Read Replica Minor Latency Spike (Resolved)',
    severity: 'Low',
    service: 'Supabase PostgreSQL Primary',
    startedAt: '2026-09-12T14:10:00Z',
    resolvedAt: '2026-09-12T14:28:00Z',
    impact: 'Read analytics queries delayed up to 450ms; zero transaction disruption.',
    postMortemUrl: '#'
  }
];

