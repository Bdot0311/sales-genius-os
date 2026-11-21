import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';

const STORAGE = 'outreign_appsumo_claim';
export default function AppSumoRedemption() {
  const queryClient = useQueryClient();
  const [claim] = useState(() => {
    const incoming = new URLSearchParams(window.location.hash.slice(1)).get('claim');
    if (incoming && /^[a-f0-9-]{72}$/.test(incoming)) {
      sessionStorage.setItem(STORAGE, incoming);
      window.history.replaceState(null, '', window.location.pathname);
    }
    return sessionStorage.getItem(STORAGE);
  });
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    document.title = 'AppSumo redemption | OutReign';
    let active = true;
    const update = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (active) { setEmail(user?.email ?? null); setLoading(false); }
    };
    void update();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void update(); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  const redeem = async () => {
    if (!claim || busy) return;
    setBusy(true); setError('');
    const { data, error: failure } = await supabase.functions.invoke('appsumo-account', { body: { action: 'redeem', claim } });
    setBusy(false);
    if (failure || !data?.success) {
      const detail = failure && 'context' in failure && failure.context instanceof Response ? await failure.context.json().catch(() => null) : null;
      setError(detail?.error ?? data?.error ?? 'Your license could not be linked. Start redemption again on AppSumo.');
      return;
    }
    sessionStorage.removeItem(STORAGE);
    await queryClient.invalidateQueries();
    setSuccess(true);
  };
  return <main className="min-h-screen bg-background text-foreground">
    <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
      <Link to="/" className="text-xl font-semibold">Out<span className="text-primary">Reign</span></Link><ThemeToggle />
    </header>
    <section className="mx-auto max-w-xl px-6 py-16">
      <p className="mb-4 text-sm font-medium text-primary">AppSumo</p>
      <h1 className="text-3xl font-semibold">{success ? 'Your subscription is connected' : 'Connect your OutReign subscription'}</h1>
      {success ? <>
        <CheckCircle2 className="my-6 size-8 text-primary" />
        <p className="mb-6 text-muted-foreground">Your AppSumo plan is now linked to your account.</p>
        <Button asChild><Link to="/dashboard">Open dashboard <ArrowRight className="ml-2 size-4" /></Link></Button>
      </> : loading ? <Loader2 className="mt-8 size-5 animate-spin text-primary" /> : !claim ? <>
        <p className="my-6 text-muted-foreground">Start from the activation link on AppSumo’s Redemption page to verify your license.</p>
        <Button asChild variant="outline"><Link to="/dashboard">Back to dashboard</Link></Button>
      </> : !email ? <>
        <p className="my-6 text-muted-foreground">Sign in or create an OutReign account to connect your verified AppSumo license.</p>
        <Button asChild><Link to="/auth?next=%2Fappsumo">Sign in or create account <ArrowRight className="ml-2 size-4" /></Link></Button>
      </> : <>
        <p className="my-6 break-words text-muted-foreground">Connect this license to <strong className="text-foreground">{email}</strong>.</p>
        {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
        <Button onClick={redeem} disabled={busy}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Connect subscription</Button>
      </>}
    </section>
  </main>;
}