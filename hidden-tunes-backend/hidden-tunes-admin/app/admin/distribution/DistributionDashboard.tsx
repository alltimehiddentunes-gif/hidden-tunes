import { useState, type ReactNode } from 'react';
import { CHANNELS, PLATFORMS, type DistributionStatus } from '@/lib/distribution/channels';
import type { DistributionSummary as Summary, Period, Metric, Breakdown } from '@/lib/distribution/types';
import type { MicrosoftStoreSummary } from '@/lib/distribution/microsoftStoreTypes';
import type { AppleAppStoreSummary } from '@/lib/distribution/appleAppStoreTypes';

type ProviderFilter = 'all' | 'apple' | 'microsoft';
const PERIODS: { id: Period; label: string }[] = [{ id: 'today', label: 'Today' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: 'all', label: 'All time' }];
const PROVIDERS: { id: ProviderFilter; label: string }[] = [
  { id: 'all', label: 'All platforms' },
  { id: 'apple', label: 'Apple App Store' },
  { id: 'microsoft', label: 'Microsoft Store' },
];
const SECTIONS = ['Overview', 'Downloads', 'Apple App Store', 'Microsoft Store', 'Sharing', 'Platforms', 'Channels', 'Usage', 'Countries', 'Versions', 'Content', 'Release status'];
const LABELS: Record<string, string> = { page_view: 'Download page views', cta_click: 'Download CTA clicks', command_copy: 'Install-command copies', artifact_request: 'Artifact requests', delivered_bytes: 'Bytes served', confirmed_delivery: 'Confirmed deliveries' };
const SHARE_METHODS: Array<{ metric: Metric; label: string }> = [
  { metric: 'share_copy_link', label: 'Links copied' }, { metric: 'share_native', label: 'Native share hand-offs' },
  { metric: 'share_whatsapp', label: 'WhatsApp hand-offs' }, { metric: 'share_facebook', label: 'Facebook hand-offs' },
  { metric: 'share_x', label: 'X hand-offs' }, { metric: 'share_telegram', label: 'Telegram hand-offs' },
  { metric: 'share_email', label: 'Email hand-offs' }, { metric: 'share_sms', label: 'SMS hand-offs' },
  { metric: 'share_qr_view', label: 'QR views' }, { metric: 'share_qr_download', label: 'QR save actions' },
];
Object.assign(LABELS, Object.fromEntries(SHARE_METHODS.map(item => [item.metric, item.label])), { share_open: 'Share controls opened', share_link_open: 'Observed shared-link opens', install_link_open: 'Observed install-link requests' });
const USAGE_FEATURES = ['Music', 'Radio', 'TV', 'Podcasts', 'Audiobooks', 'Lectures', 'Motivationals', 'Emotional Worlds', 'Search', 'Lyrics', 'Favorites', 'Playlists', 'Downloads'];
const STORE_IDS = new Set(['google_play', 'apple_app_store', 'microsoft_store', 'amazon_fire', 'huawei', 'samsung']);
const number = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value) : 'N/A';
const isoDate = (value?: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'Not available';
const sectionId = (value: string) => value.toLowerCase().replaceAll(' ', '-');
function Badge({ status }: { status: DistributionStatus }) {
  return <span className={`dist-badge dist-badge--${sectionId(status)}`}>{status}</span>;
}
function Panel({ id, title, note, children }: { id?: string; title: string; note?: string; children: ReactNode }) {
  return <section id={id} className="dist-panel"><div className="dist-section-heading"><h2>{title}</h2>{note && <p>{note}</p>}</div>{children}</section>;
}
function MetricCard({ label, value, source, note, change }: { label: string; value: number | null; source: string; note?: string; change?: number | null }) {
  return <article className="dist-metric"><h3>{label}</h3><strong>{number(value)}</strong><p className="dist-source">Source: {source}</p>{note && <p>{note}</p>}
    {change !== undefined && <p className="dist-comparison">{typeof change === 'number' && Number.isFinite(change) ? `${change > 0 ? '+' : ''}${number(change)}% vs previous comparable period` : 'Change: N/A · comparable coverage unavailable'}</p>}</article>;
}
function Table({ caption, headings, children }: { caption: string; headings: string[]; children: ReactNode }) {
  return <div className="dist-table-scroll" tabIndex={0} role="region" aria-label={caption}><table><caption>{caption}</caption><thead><tr>{headings.map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
function Empty({ children }: { children: ReactNode }) { return <p className="dist-empty">{children}</p>; }


export type DistributionDashboardProps = {
  data: Summary | null;
  period: Period;
  loading?: boolean;
  error?: string;
  onPeriodChange?: (period: Period) => void;
  onRefresh?: () => void;
  microsoftStore?: MicrosoftStoreSummary | null;
  microsoftStorePanel?: ReactNode;
  appleAppStore?: AppleAppStoreSummary | null;
  appleAppStorePanel?: ReactNode;
};

// Pure render surface: production authentication remains in the page wrapper.
// A standalone test preview can render this with unavailable data without an auth bypass.
export function DistributionDashboard({ data, period, loading = false, error = '', onPeriodChange, onRefresh, microsoftStore, microsoftStorePanel, appleAppStore, appleAppStorePanel }: DistributionDashboardProps) {
  const [provider, setProvider] = useState<ProviderFilter>('all');
  const showApple = provider === 'all' || provider === 'apple';
  const showMicrosoft = provider === 'all' || provider === 'microsoft';
  const showWebsite = provider === 'all';
  const sourceLabel = (id: string) => data?.sources.find(source => source.id === id)?.label || id || 'Unknown source';
  const websiteSource = data?.sources.find(source => source.id === 'website')?.label || 'First-party website events · not yet available';
  const sharingSource = data?.sources.find(source => source.id === 'website_sharing')?.label || 'Share observations · not yet available';
  const artifactSources = data?.sources.filter(source => source.id !== 'website' && source.id !== 'website_sharing') || [];
  const artifactSource = artifactSources.length ? artifactSources.map(source => source.label).join('; ') : 'Artifact evidence · not connected';
  const breakdown = (kind: keyof Summary['breakdowns']) => data?.breakdowns[kind] || [];
  const metricValue = (metric: Metric) => data?.totals[metric] ?? null;
  const coverage = (metric: Metric) => data?.metricCoverage?.[metric]?.note || 'Source coverage not yet available.';
  const measuredNote = (metric: Metric, explanation: string) => `${explanation}. ${coverage(metric)}`;
  const metricChange = (metric: Metric) => data?.changes[metric] ?? null;
  const namedKey = (key: string) => CHANNELS.find(channel => channel.id === key)?.name || PLATFORMS[key as keyof typeof PLATFORMS] || ((key === 'unknown' || key === 'ZZ') ? 'Unknown / unattributed' : key);
  const rowsFor = (kind: keyof Summary['breakdowns'], key: string, metric: Metric) => breakdown(kind).filter(row => row.key === key && row.metric === metric);
  const evidenceCell = (rows: Breakdown[], empty = 'No connected evidence') => rows.length ? rows.map((row, index) => <span className="dist-cell-value" key={`${row.source}-${index}`}><b>{number(row.value)}</b><small>Source: {sourceLabel(row.source)}</small></span>) : <span className="dist-cell-value">N/A<small>{empty}</small></span>;
  const pendingCell = <span className="dist-cell-value">N/A<small>Client update required</small></span>;
  const storeCounts = <span className="dist-cell-value"><b>{number(microsoftStore?.metrics.store_installs.value)} Store installs</b><small>{number(microsoftStore?.metrics.store_acquisitions.value)} license acquisitions</small><small>Source: Microsoft report/API · {microsoftStore?.status.replaceAll('_', ' ') || 'NOT CONNECTED'}</small><a href="#microsoft-store">Reporting dates and source details</a></span>;
  const appleCounts = <span className="dist-cell-value"><b>{number(appleAppStore?.metrics.store_units.value)} App units</b><small>{number(appleAppStore?.metrics.store_updates.value)} updates</small><small>Source: App Store Connect · {appleAppStore?.status.replaceAll('_', ' ') || 'NOT CONNECTED'} · Apple ID 6773324462</small><a href="#apple-app-store">Reporting dates and source details</a></span>;
  const latestDays = (data?.trend || []).slice(-31);
  const requestMax = Math.max(1, ...latestDays.map(day => day.artifact_request ?? 0));
  const countryRequests = breakdown('country').filter(row => row.metric === 'artifact_request' && row.value !== null).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 3);

  function breakdownTable(kind: keyof Summary['breakdowns'], caption: string) {
    const rows = breakdown(kind);
    return rows.length ? <Table caption={caption} headings={[kind === 'campaign' ? 'Campaign / referrer' : kind[0].toUpperCase() + kind.slice(1), 'Measurement', 'Count', 'Source']}>
      {rows.map((row, index) => <tr key={`${row.key}-${row.metric}-${row.source}-${index}`}><th scope="row">{namedKey(row.key)}</th><td>{LABELS[row.metric] || row.metric}</td><td>{number(row.value)}</td><td>{sourceLabel(row.source)}</td></tr>)}
    </Table> : <Empty>No measured {kind} data is available for this period. Unavailable data is shown as N/A.</Empty>;
  }

  return <>
    <div className="dist-center">
      <div className="dist-toolbar"><div><span className="dist-eyebrow">Command center</span><p>18 channels · dated owner and release evidence</p></div>
        <div className="dist-periods" role="group" aria-label="Analytics period">{PERIODS.map(item => <button key={item.id} type="button" aria-pressed={period === item.id} onClick={() => onPeriodChange?.(item.id)}>{item.label}</button>)}</div>
        <button className="dist-refresh" type="button" disabled={loading} onClick={onRefresh}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      <div className="dist-periods" role="group" aria-label="Store provider filter">{PROVIDERS.map(item => <button key={item.id} type="button" aria-pressed={provider === item.id} onClick={() => setProvider(item.id)}>{item.label}</button>)}</div>
      <nav className="dist-tabs" aria-label="Distribution sections">{SECTIONS.map(section => <a key={section} href={`#${sectionId(section)}`}>{section}</a>)}</nav>
      <div aria-live="polite" className="dist-load-status">{loading ? 'Loading measured data…' : data ? `Measured window: ${isoDate(data.range.from)} → ${isoDate(data.range.to)} · Prepared ${isoDate(data.generatedAt)}` : 'Measured data is not available.'}</div>
      {error && <div role="alert" className="dist-warning"><strong>Metrics unavailable</strong><p>{error}</p><button type="button" onClick={onRefresh}>Retry</button></div>}
      <div className="dist-notice"><strong>Requests, clicks and installations are different measurements.</strong><p>Artifact requests can include retries or partial transfers. Store units/installs require provider imports. First launches, people and listening time require client telemetry. N/A means unavailable; it does not mean zero. Apple and Microsoft metrics keep separate definitions.</p></div>

      <section id="overview" aria-labelledby="dist-overview-title"><div className="dist-section-heading"><h2 id="dist-overview-title">Overview</h2><p>Cross-platform store evidence plus website/artifact measurements. Provider totals are never merged into one fake download number.</p></div>
        <div className="dist-kpis">
          {showWebsite && <MetricCard label="Download requests" value={metricValue('artifact_request')} source={artifactSource} note={measuredNote('artifact_request', 'HTTP artifact requests; not installations')} change={metricChange('artifact_request')} />}
          {showApple && <MetricCard label="Apple App Store units" value={appleAppStore?.metrics.store_units.value ?? null} source={`Hidden Tunes · Apple ID 6773324462 · ${appleAppStore?.status.replaceAll('_', ' ') || 'NOT CONNECTED'}`} note="Sales units only; not Microsoft installs or first launches" change={appleAppStore?.metrics.store_units.change ?? null} />}
          {showMicrosoft && <MetricCard label="Microsoft Store installs" value={microsoftStore?.metrics.store_installs.value ?? null} source={`Product 9N9XGSTD8889 · ${microsoftStore?.status.replaceAll('_', ' ') || 'NOT CONNECTED'}`} note="Successful Store installs; may include reinstalls. Requires Partner Center credentials or a manual report import." change={microsoftStore?.metrics.store_installs.change ?? null} />}
          {showMicrosoft && <MetricCard label="Microsoft Store acquisitions" value={microsoftStore?.metrics.store_acquisitions.value ?? null} source={`Product 9N9XGSTD8889 · ${microsoftStore?.status.replaceAll('_', ' ') || 'NOT CONNECTED'}`} note="License acquisitions. N/A until API credentials or report import exist." change={microsoftStore?.metrics.store_acquisitions.change ?? null} />}
          {showApple && <MetricCard label="Apple App Store updates" value={appleAppStore?.metrics.store_updates.value ?? null} source={`Hidden Tunes · Apple ID 6773324462 · ${appleAppStore?.status.replaceAll('_', ' ') || 'NOT CONNECTED'}`} note="Sales update units only" change={appleAppStore?.metrics.store_updates.change ?? null} />}
          {['First launches', 'Active users', 'Sessions'].map(label => <MetricCard key={label} label={label} value={null} source="First-party client telemetry" note="Client update required" change={null} />)}
        </div>
        <div className="dist-live-row"><span><b>Active now</b> N/A</span><span><b>Listening now</b> N/A</span><p>Source: first-party foreground/playback telemetry · client update required</p></div>
      </section>

      {showWebsite && <Panel id="downloads" title="Downloads" note="Every stage keeps its own source. This V1 does not claim person-level conversion or completed installations.">
        <ol className="dist-funnel">{[
          { label: 'Download page views', value: metricValue('page_view'), source: websiteSource, coverage: coverage('page_view') },
          { label: 'Download CTA clicks', value: metricValue('cta_click'), source: websiteSource, coverage: coverage('cta_click') },
          { label: 'Artifact requests', value: metricValue('artifact_request'), source: artifactSource, coverage: coverage('artifact_request') },
          { label: 'First launches', value: null, source: 'Client update required' },
          { label: 'Signups', value: null, source: 'Acquisition attribution not connected' },
          { label: 'Active users', value: null, source: 'Client update required' },
        ].map(stage => <li key={stage.label}><span>{stage.label}</span><b>{number(stage.value)}</b><small>Source: {stage.source}</small>{stage.coverage && <small>{stage.coverage}</small>}</li>)}</ol>
        <div className="dist-small-kpis"><MetricCard label="Bytes served" value={metricValue('delivered_bytes')} source={artifactSource} note={measuredNote('delivered_bytes', 'Only bytes recorded by delivery infrastructure')} change={metricChange('delivered_bytes')} /><MetricCard label="Confirmed deliveries" value={metricValue('confirmed_delivery')} source={artifactSource} note={measuredNote('confirmed_delivery', 'Only when complete delivery is explicitly evidenced')} change={metricChange('confirmed_delivery')} /><MetricCard label="Install-command copies" value={metricValue('command_copy')} source={websiteSource} note={measuredNote('command_copy', 'Command copies are not package installs')} change={metricChange('command_copy')} /></div>
        <div className="dist-subheading"><h3>Download request trend</h3><p>Source: {artifactSource} · up to the latest 31 measured days. Missing data is N/A; daily bars may cover only part of a day. Counts reflect available evidence. {coverage('artifact_request')}</p></div>
        {latestDays.some(day => day.artifact_request !== null) ? <div className="dist-trend-scroll" role="region" aria-label="Artifact requests by day" tabIndex={0}><div className="dist-trend">{latestDays.map(day => <div className="dist-trend-day" key={day.date}><span>{number(day.artifact_request)}</span><div className="dist-bar-track">{day.artifact_request !== null && <div className="dist-bar" style={{ height: `${day.artifact_request / requestMax * 100}%` }} />}</div><small>{day.date.slice(5, 10)}</small></div>)}</div></div> : <Empty>No artifact-request trend is connected for this period.</Empty>}
        {latestDays.length > 0 && <details className="dist-details"><summary>View daily measurements and website trend</summary><Table caption="Latest measured days, up to 31" headings={['Day (UTC)', 'Page views', 'CTA clicks', 'Artifact requests']}>
          {latestDays.map(day => <tr key={day.date}><th scope="row">{day.date}</th><td>{number(day.page_view)}</td><td>{number(day.cta_click)}</td><td>{number(day.artifact_request)}</td></tr>)}
        </Table><p className="dist-source">Views / clicks: {websiteSource}. Artifact requests: {artifactSource}.</p></details>}
        <div className="dist-subheading"><h3>Acquisition &amp; QR campaigns</h3><p>Website campaign visits and clicks only unless artifact evidence carries verified attribution. A campaign-link visit does not prove a unique QR scan or first launch.</p></div>
        {breakdownTable('campaign', 'Acquisition evidence by campaign and source')}
      </Panel>}

      {showApple && appleAppStorePanel}
      {showMicrosoft && microsoftStorePanel}

      {showWebsite && <Panel id="sharing" title="Sharing" note="These are observed controls, hand-offs and link requests. They do not confirm that a message was sent, a file was downloaded or an app was launched.">
        <div className="dist-small-kpis">
          <MetricCard label="Share controls opened" value={metricValue('share_open')} source={sharingSource} note={measuredNote('share_open', 'Repeated actions are counted separately')} />
          <MetricCard label="Observed shared-link opens" value={metricValue('share_link_open')} source={sharingSource} note={measuredNote('share_link_open', 'Tagged install-link requests and Download Center arrivals; not unique recipients')} />
          <MetricCard label="Observed install-link requests" value={metricValue('install_link_open')} source={sharingSource} note={measuredNote('install_link_open', 'All observed /get requests, including the shared subset')} />
          <MetricCard label="Downloads from shares" value={null} source="Attributed delivery evidence" note="Not connected; a shared-link request does not prove delivery" />
          <MetricCard label="First launches from shares" value={null} source="Attributed client telemetry" note="Client update and verified attribution required" />
        </div>
        <Table caption="Share actions by method" headings={['Observed action', 'Count', 'Coverage']}>
          {SHARE_METHODS.map(item => <tr key={item.metric}><th scope="row">{item.label}</th><td>{number(metricValue(item.metric))}</td><td>{coverage(item.metric)}</td></tr>)}
        </Table>
        <p className="dist-footnote">Source: {sharingSource}. Native and social hand-offs do not expose recipients or message contents. Link previews, automated traffic and repeated requests may be included. Tracking preferences, blockers or unavailable post-response processing can prevent observations. Campaign labels are not person-level attribution.</p>
      </Panel>}

      <Panel id="platforms" title="Platforms" note="Artifact platform and installation channel are separate. Web page views are never counted as active users.">
        <div className="dist-platform-grid">{Object.entries(PLATFORMS).map(([id, label]) => <article className="dist-platform" key={id}><h3>{label}</h3><dl><div><dt>Download requests</dt><dd>{evidenceCell(rowsFor('platform', id, 'artifact_request'))}</dd></div>{id === 'windows' && showMicrosoft && <div><dt>Microsoft Store</dt><dd>{storeCounts}</dd></div>}{id === 'ios' && showApple && <div><dt>Apple App Store</dt><dd>{appleCounts}</dd></div>}{['First launches', 'Active installations', 'DAU', 'MAU', 'Sessions', 'Listening hours'].map(metric => <div key={metric}><dt>{metric}</dt><dd>N/A</dd></div>)}<div><dt>Latest baseline version</dt><dd>{[...new Set(CHANNELS.filter(channel => channel.platform === id && channel.status === 'LIVE').map(channel => channel.version).filter(Boolean))].join(' / ') || 'N/A'}</dd></div></dl><p className="dist-source">Usage: client update required. Version: dated release baseline.</p></article>)}</div>
        <details className="dist-details"><summary>Platform measurements by source</summary>{breakdownTable('platform', 'Platform evidence')}</details>
      </Panel>

      <Panel id="channels" title="Channels" note="Channel attribution is recorded when evidence supports it. Shared installer URLs cannot distinguish direct downloads from Homebrew or Scoop.">
        <Table caption="Distribution channels and measured activation" headings={['Channel', 'Status', 'Version', 'Download / Store evidence', 'First launches', 'Active users', 'Activation', 'Last verified']}>
          {CHANNELS.map(channel => <tr key={channel.id}><th scope="row"><a href={`#release-${channel.id}`}>{channel.name}</a><small>{channel.id}</small></th><td><Badge status={channel.status} /></td><td>{channel.version || 'N/A'}</td><td>{channel.id === 'microsoft_store' ? storeCounts : channel.id === 'apple_app_store' ? appleCounts : evidenceCell(rowsFor('channel', channel.id, 'artifact_request'), 'Downloads: N/A')}</td><td>{pendingCell}</td><td>{pendingCell}</td><td>{pendingCell}</td><td>{channel.lastVerified}<small>Release evidence</small></td></tr>)}
        </Table>
        <div className="dist-subheading"><h3>Store reporting connections</h3><p>Store acquisitions stay separate from artifact requests and first-party app usage. Supported reports/imports only; Store dashboards are not scraped. Apple and Microsoft keep distinct metric definitions.</p></div>
        <Table caption="Store connector availability" headings={['Store', 'Connection / freshness', 'Units / acquisitions', 'First-party app usage']}>
          {CHANNELS.filter(channel => STORE_IDS.has(channel.id)).map(channel => <tr key={channel.id}><th scope="row">{channel.name}</th><td>{channel.id === 'microsoft_store' ? microsoftStore?.status.replaceAll('_', ' ') || 'NOT CONNECTED' : channel.id === 'apple_app_store' ? appleAppStore?.status.replaceAll('_', ' ') || 'NOT CONNECTED' : 'MANUAL / NOT CONNECTED'}</td><td>{channel.id === 'microsoft_store' ? <>{number(microsoftStore?.metrics.store_acquisitions.value)} acquisitions · {number(microsoftStore?.metrics.store_installs.value)} installs<small>Source: Microsoft report/API</small><a href='#microsoft-store'>Coverage and imports</a></> : channel.id === 'apple_app_store' ? <>{number(appleAppStore?.metrics.store_units.value)} units · {number(appleAppStore?.metrics.store_updates.value)} updates<small>Source: App Store Connect · Apple ID 6773324462</small><a href='#apple-app-store'>Coverage and imports</a></> : <>N/A<small>Supported Store report/API required</small></>}</td><td>{pendingCell}</td></tr>)}
        </Table>
      </Panel>

      <Panel id="usage" title="Usage" note="Anonymous installations and authenticated users will remain separate. Background service wakeups are not user sessions.">
        <div className="dist-small-kpis">{['DAU', 'WAU', 'MAU', 'New users', 'Returning users', 'Average session length', 'Crash-free sessions', 'Playback success rate'].map(label => <MetricCard key={label} label={label} value={null} source="First-party client telemetry" note="Client update required" />)}</div>
        <p className="dist-footnote">Listening time, session length and playback rates are unavailable until bounded foreground/session and playback events arrive from an instrumented client release.</p>
      </Panel>

      <Panel id="countries" title="Countries" note="Coarse country only, from trusted request infrastructure when available. Unknown geography remains unknown.">
        {countryRequests.length > 0 && <div className="dist-small-kpis">{countryRequests.map(row => <MetricCard key={`${row.key}-${row.source}`} label={`${namedKey(row.key)} · download requests`} value={row.value} source={sourceLabel(row.source)} />)}</div>}
        {breakdownTable('country', 'Country measurements by source')}
        <p className="dist-footnote">Country first launches, active users and listening hours: N/A · client update required. No precise location is collected.</p>
      </Panel>

      <Panel id="versions" title="Versions" note="Artifact/version evidence is available separately from app adoption. Downloading a version does not establish that it was launched.">
        {breakdownTable('version', 'Version measurements by source')}
        <p className="dist-footnote">Version/channel first launches, active users, sessions and crash/error rate: N/A · client update required.</p>
      </Panel>

      <Panel id="content" title="Content & feature usage" note="Source: first-party client telemetry · client update required. Catalog size and API requests do not measure listening.">
        <Table caption="Feature measurement readiness" headings={['Feature', 'Feature opens', 'Playback starts', 'Listening minutes']}>
          {USAGE_FEATURES.map(feature => <tr key={feature}><th scope="row">{feature}</th><td>N/A</td><td>N/A</td><td>N/A</td></tr>)}
        </Table>
      </Panel>

      <Panel id="release-status" title="Release status" note="Owner and release evidence with per-channel verification dates. These records are not live Store queries; no pending channel is presented as publicly available.">
        <div className="dist-releases">{CHANNELS.map(channel => <article id={`release-${channel.id}`} key={channel.id} className="dist-release"><div className="dist-release-heading"><h3>{channel.name}</h3><Badge status={channel.status} /></div><p>{PLATFORMS[channel.platform]} · Version {channel.version || 'unverified'} · Last verified {channel.lastVerified}</p><dl><div><dt>Review</dt><dd>{channel.reviewStatus}</dd></div><div><dt>Blocker</dt><dd>{channel.blocker}</dd></div><div><dt>Next action</dt><dd>{channel.nextAction}</dd></div></dl>{channel.publicUrl && <a className="dist-evidence-link" href={channel.publicUrl} target="_blank" rel="noopener noreferrer">{channel.status === 'LIVE' ? 'Published channel / artifact' : 'Review / package record'} ↗</a>}<p className="dist-source">Source: {channel.source}</p></article>)}</div>
      </Panel>

      <Panel id="data-sources" title="Measurement sources & coverage" note="All times are UTC. A percentage change appears only when comparable source coverage exists. All-time comparisons are unavailable.">
        {data?.sources.length ? <div className="dist-sources">{data.sources.map(source => <article key={source.id}><div><h3>{source.label}</h3><span className="dist-source-tag">{source.freshness.replaceAll('_', ' ')}</span></div><p>Coverage: {isoDate(source.from)} → {isoDate(source.to)}</p><p>{source.note}</p></article>)}</div> : <Empty>No measurement sources reported yet. Release status records remain available above.</Empty>}
        {data?.previous && <p className="dist-footnote">Previous comparable window: {isoDate(data.previous.from)} → {isoDate(data.previous.to)}</p>}
        <p className="dist-footnote">Privacy: coarse country, bounded campaign/referrer labels and aggregate evidence. No raw IP addresses, precise locations, stream URLs, signed playback URLs or sensitive full logs belong in this dashboard.</p>
      </Panel>
    </div>
  </>;
}
