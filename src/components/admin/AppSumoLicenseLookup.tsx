import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/dashboard/Panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';

type License = { license_key: string; license_status: string; tier: number; is_test: boolean; user_id: string | null; prev_license_key: string | null };
type Event = { event: string; event_timestamp: number; received_at: string };
export function AppSumoLicenseLookup() {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ license: License | null; events: Event[] } | null>(null);
  const [error, setError] = useState('');
  const lookup = async (event: React.FormEvent) => {
    event.preventDefault(); if (!key.trim()) return;
    setBusy(true); setError(''); setResult(null);
    const { data, error: failure } = await supabase.functions.invoke('appsumo-account', { body: { action: 'lookup', license_key: key.trim() } });
    setBusy(false);
    if (failure || data?.error) { setError(data?.error ?? 'Could not look up this license'); return; }
    setResult(data);
  };
  return <Panel>
    <PanelHeader><PanelTitle>AppSumo licenses</PanelTitle></PanelHeader>
    <PanelBody className="space-y-4">
      <form onSubmit={lookup} className="space-y-2">
        <Label htmlFor="appsumo-license-key">License key</Label>
        <div className="flex items-center gap-2"><Input id="appsumo-license-key" value={key} onChange={e => setKey(e.target.value)} maxLength={200} className="min-w-0" /><Button type="submit" variant="outline" disabled={busy || !key.trim()} aria-label="Look up AppSumo license" title="Look up license"><Search className="size-4" /></Button></div>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {result && !result.license && <p className="text-sm text-muted-foreground">No matching license.</p>}
      {result?.license && <div className="space-y-3">
        <div className="flex flex-wrap gap-2"><Badge variant="outline">{result.license.license_status}</Badge><Badge variant="secondary">Tier {result.license.tier}</Badge>{result.license.is_test && <Badge variant="outline">Test license</Badge>}</div>
        <p className="break-all text-sm">{result.license.license_key}</p>
        <p className="text-sm text-muted-foreground">{result.license.user_id ? 'Linked to an account' : 'Not linked to an account'}</p>
        {result.license.prev_license_key && <p className="break-all text-xs text-muted-foreground">Previous license: {result.license.prev_license_key}</p>}
        <ul className="divide-y divide-border">{result.events.map(e => <li key={`${e.event}-${e.event_timestamp}`} className="flex flex-wrap justify-between gap-2 py-2 text-xs"><span>{e.event}</span><time>{new Date(e.received_at).toLocaleString()}</time></li>)}</ul>
      </div>}
    </PanelBody>
  </Panel>;
}