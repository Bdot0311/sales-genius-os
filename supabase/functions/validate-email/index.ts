// Public email validator used pre-signup to block fake / disposable / undeliverable addresses.
// Checks: syntax, disposable domain list, MX records via DNS-over-HTTPS.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Curated list of common disposable / temp-mail domains.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","trashmail.com","tempmail.com","temp-mail.org","temp-mail.io",
  "guerrillamail.com","guerrillamail.net","guerrillamail.org","guerrillamail.biz",
  "10minutemail.com","10minutemail.net","20minutemail.com","yopmail.com","yopmail.fr",
  "fakeinbox.com","throwawaymail.com","getnada.com","nada.email","getairmail.com",
  "maildrop.cc","mailnesia.com","mintemail.com","spambox.us","sharklasers.com",
  "grr.la","dispostable.com","mailcatch.com","incognitomail.org","mvrht.net",
  "tempinbox.com","mytemp.email","emailondeck.com","throwawaymail.io","spam4.me",
  "trashmail.net","trashmail.de","mailtothis.com","mailforspam.com","mohmal.com",
  "burnermail.io","tutanota-temp.com","mailpoof.com","tempr.email","discardmail.com",
  "fakemail.net","mailbox.in.ua","mailnull.com","sneakemail.com","spambog.com",
  "emltmp.com","throwam.com","tmail.ws","tmpmail.org","temporary-mail.net",
  "tempmailo.com","minutemail.com","minutemail.net","wegwerfemail.de","mailtemp.net",
  "moakt.com","mailto.plus","fexpost.com","fexbox.org","mailbox.org","emlhub.com",
  "tempmail.email","tempmail.us.com","tempmailfree.com","tempemail.net",
  "0-mail.com","0wnd.net","0wnd.org","20email.eu","2prong.com","30wave.com",
  "33mail.com","4warding.com","6paq.com","7tags.com","9ox.net","trbvm.com",
]);

const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

interface Result {
  valid: boolean;
  reason?: string;
  checks: {
    syntax: boolean;
    disposable: boolean; // true means is disposable (bad)
    mx: boolean; // true means MX records exist (good)
  };
}

async function checkMx(domain: string): Promise<boolean> {
  try {
    const ctl = AbortSignal.timeout(4000);
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { accept: "application/dns-json" },
      signal: ctl,
    });
    if (!res.ok) return true; // fail-open on DNS errors so legit users aren't blocked
    const json = await res.json();
    if (Array.isArray(json.Answer) && json.Answer.length > 0) return true;
    // Fallback: some domains accept mail on A record only
    const aRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, {
      headers: { accept: "application/dns-json" },
    });
    const aJson = await aRes.json();
    return Array.isArray(aJson.Answer) && aJson.Answer.length > 0;
  } catch {
    return true; // fail-open
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const email = body?.email;
    const result: Result = {
      valid: false,
      checks: { syntax: false, disposable: false, mx: false },
    };

    if (!email || typeof email !== "string" || email.length > 320) {
      result.reason = "Email is required.";
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }


    const normalized = email.trim().toLowerCase();
    result.checks.syntax = EMAIL_RE.test(normalized);
    if (!result.checks.syntax) {
      result.reason = "That email address doesn't look valid.";
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const domain = normalized.split("@")[1];
    result.checks.disposable = DISPOSABLE_DOMAINS.has(domain);
    if (result.checks.disposable) {
      result.reason = "Disposable or temporary email addresses are not allowed. Please use a permanent address.";
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    result.checks.mx = await checkMx(domain);
    if (!result.checks.mx) {
      result.reason = `The domain "${domain}" cannot receive email. Please use a real address.`;
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    result.valid = true;
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    console.error("validate-email error:", err?.message ?? err);
    return new Response(
      JSON.stringify({ valid: false, checks: { syntax: false, disposable: false, mx: false }, reason: "Could not verify this email. Please try again." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  }
});
