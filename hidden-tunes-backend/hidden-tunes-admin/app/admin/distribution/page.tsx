"use client";

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { getActiveUploaderSession } from '@/lib/auth';
import type { DistributionSummary, Period } from '@/lib/distribution/types';
import { DistributionDashboard } from './DistributionDashboard';
import './distribution.css';
import { MicrosoftStorePanel } from './MicrosoftStorePanel';
import type { MicrosoftStoreSummary } from '@/lib/distribution/microsoftStoreTypes';
import { AppleAppStorePanel } from './AppleAppStorePanel';
import type { AppleAppStoreSummary } from '@/lib/distribution/appleAppStoreTypes';

const metrics = ['page_view', 'cta_click', 'command_copy', 'artifact_request', 'delivered_bytes', 'confirmed_delivery'] as const;
function validSummary(value: unknown): value is DistributionSummary {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DistributionSummary>;
  const nullableNumber = (item: unknown) => item === null || (typeof item === 'number' && Number.isFinite(item));
  return Boolean(candidate.totals && metrics.every(metric => nullableNumber(candidate.totals?.[metric]))
    && candidate.changes && Object.values(candidate.changes).every(nullableNumber)
    && candidate.range && typeof candidate.range.from === 'string' && typeof candidate.range.to === 'string'
    && typeof candidate.generatedAt === 'string' && ['today', '7d', '30d', 'all'].includes(candidate.period || '')
    && Array.isArray(candidate.trend) && candidate.trend.every(row => row && typeof row.date === 'string' && [row.page_view, row.cta_click, row.artifact_request].every(nullableNumber))
    && Array.isArray(candidate.sources) && candidate.sources.every(source => source && ['id', 'label', 'freshness', 'note'].every(key => typeof source[key as 'id'] === 'string'))
    && candidate.breakdowns && ['platform', 'channel', 'country', 'campaign', 'version'].every(key => {
      const rows = candidate.breakdowns?.[key as keyof DistributionSummary['breakdowns']];
      return Array.isArray(rows) && rows.every(row => row && typeof row.key === 'string' && typeof row.source === 'string' && typeof row.metric === 'string' && typeof row.value === 'number' && Number.isFinite(row.value));
    }));
}

export default function DistributionPage() {
  const [period, setPeriod] = useState<Period>('today');
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<DistributionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [store, setStore] = useState<MicrosoftStoreSummary | null>(null);
  const [appleStore, setAppleStore] = useState<AppleAppStoreSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      if (!disposed) { setLoading(false); setError('The analytics service took too long to respond. Please retry.'); }
    }, 20_000);
    const timer = window.setTimeout(() => {
      async function load() {
        setLoading(true); setError(''); setData(null);
        try {
          const { session } = await getActiveUploaderSession();
          if (controller.signal.aborted) throw new Error('Request cancelled');
          if (!session) throw new Error('Sign in with an owner or admin account to view distribution metrics.');
          const response = await fetch(`/api/admin/distribution?period=${period}`, {
            headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal, cache: 'no-store',
          });
          if (!response.ok) throw new Error(response.status === 403 ? 'Distribution metrics are available to owner or admin accounts only.' : response.status === 401 ? 'Your session has expired. Sign in again.' : `Distribution metrics are unavailable (HTTP ${response.status}). Please retry.`);
          const result: unknown = await response.json();
          if (!validSummary(result)) throw new Error('The analytics service returned an incomplete response. Please retry.');
          if (!disposed && !controller.signal.aborted) setData(result);
        } catch (reason) {
          if (!disposed) setError(timedOut ? 'The analytics service took too long to respond. Please retry.' : reason instanceof Error ? reason.message : 'Unable to load distribution metrics. Please retry.');
        } finally { window.clearTimeout(timeout); if (!disposed) setLoading(false); }
      }
      void load();
    }, 0);
    return () => { disposed = true; window.clearTimeout(timer); window.clearTimeout(timeout); controller.abort(); };
  }, [period, revision]);

  return <AdminShell eyebrow="Hidden Tunes · Distribution" title="Distribution + Usage" description="Where Hidden Tunes is available, how people find it, and what we can measure.">
    <DistributionDashboard data={data} period={period} loading={loading} error={error} onPeriodChange={setPeriod} onRefresh={() => setRevision(value => value + 1)} microsoftStore={store?.period === period ? store : null} microsoftStorePanel={<MicrosoftStorePanel key={`ms-${revision}`} period={period} onSummary={setStore} />} appleAppStore={appleStore?.period === period ? appleStore : null} appleAppStorePanel={<AppleAppStorePanel key={`apple-${revision}`} period={period} onSummary={setAppleStore} />} />
  </AdminShell>;
}
