import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, requireServiceRole } from "../_shared/internal-auth.ts";
import { captureServerEvent } from "../_shared/posthog.ts";
import { sendAppEmail } from "../_shared/transactional-email-templates/send-app-email.ts";
import { isReservedTestRecipient } from "../_shared/test-recipients.ts";


serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  const unauth = requireServiceRole(req);
  if (unauth) return unauth;

  try {

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const NOTIFICATION_EMAIL = Deno.env.get('NOTIFICATION_EMAIL') || 'brandon@bdotindustries.com';

    const { record } = await req.json();

    // Hard guard: never send admin notifications for incomplete/fake signups.
    // A real signup row always has an email; if missing, drop silently with 200.
    const rawEmail = (record?.email || '').toString().trim().toLowerCase();
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail);
    if (!emailValid) {
      console.warn('notify-new-signup: skipped — missing/invalid email on record', { hasRecord: !!record });
      return new Response(JSON.stringify({ success: true, skipped: 'invalid_email' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Nothing happens for a synthetic signup.
    //
    // isReservedTestRecipient already guarded every send, but it guards the
    // RECIPIENT. The three emails addressed to the new user were suppressed by
    // it correctly; the admin notification is addressed to a real inbox, so it
    // went out — one "🎉 New User Signup" for every run of the live auth smoke
    // test, from CI, from Lovable, from anyone who cloned the repo and ran the
    // suite. The subject of the notification is the test address, not its
    // recipient, which is the distinction that was missing.
    //
    // Placed above the analytics call as well: a smoke signup counted in
    // PostHog is a number in the funnel that never belonged to a person.
    if (isReservedTestRecipient(rawEmail)) {
      console.log('notify-new-signup: skipped — reserved test domain', { email: rawEmail });
      return new Response(JSON.stringify({ success: true, skipped: 'test_domain' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userEmail = rawEmail;
    const fullName = (record?.full_name || '').toString().trim() || 'No name provided';
    const signupTime = new Date(record?.created_at || Date.now()).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    // Use Lovable's transactional email infrastructure
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const displayName = (record?.full_name || '').toString().trim() || userEmail.split('@')[0];
    const userId = record?.id || userEmail;

    // Read the real plan instead of assuming "free" — paid signups come through
    // checkout and their subscription row may land a moment after the profile.
    let plan = 'free';
    if (record?.id) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('plan')
          .eq('user_id', record.id)
          .maybeSingle();
        if (sub?.plan) {
          plan = sub.plan;
          if (sub.plan !== 'free') break;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);

    // Product analytics: signup is created server-side by a DB trigger, so the
    // browser cannot be the source of truth for it.
    await captureServerEvent(
      'signup_created',
      userId,
      { email: userEmail, name: displayName, plan },
      { email: userEmail, name: displayName, plan, signup_date: record?.created_at ?? new Date().toISOString() },
    );



    // 1. Admin notification
    const notifyRes = await sendAppEmail(supabase, 'signup-notification', NOTIFICATION_EMAIL, {
      idempotencyKey: `signup-notify-${userId}`,
      templateData: {
        userName: fullName,
        userEmail: userEmail,
        plan: planLabel,
        signupDate: signupTime,
      },
    });
    if (!notifyRes.sent) console.error('signup-notification not sent:', notifyRes.reason, notifyRes.error ?? '');

    // 2. Welcome email to the new user
    const welcomeRes = await sendAppEmail(supabase, 'welcome-email', userEmail, {
      idempotencyKey: `welcome-${userId}`,
      templateData: { name: displayName },
    });
    if (!welcomeRes.sent) console.error('welcome-email not sent:', welcomeRes.reason, welcomeRes.error ?? '');

    // 3. Personal founder note
    const founderRes = await sendAppEmail(supabase, 'founder-note', userEmail, {
      idempotencyKey: `founder-note-${userId}`,
      templateData: { name: displayName },
    });
    if (!founderRes.sent) console.error('founder-note not sent:', founderRes.reason, founderRes.error ?? '');

    // 4. Nurturing onboarding offer — free help launching first campaign
    const onboardingRes = await sendAppEmail(supabase, 'onboarding-offer', userEmail, {
      idempotencyKey: `onboarding-offer-${userId}`,
      templateData: { name: displayName },
    });
    if (!onboardingRes.sent) console.error('onboarding-offer not sent:', onboardingRes.reason, onboardingRes.error ?? '');

    console.log('Signup emails processed for:', userEmail);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error sending signup notification:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
