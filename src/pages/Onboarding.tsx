/**
 * Required questionnaire every new account completes before the dashboard opens.
 *
 * The answers do real work: question 5 becomes the user's first ICP, the "what
 * you sell" box becomes their business description used when drafting emails,
 * and the discovery channel feeds the admin signup-channel report.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { SEOHead } from "@/components/seo/SEOHead";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Rocket } from "lucide-react";
import outReignLogo from "@/assets/outreign-logo-64.webp";
import { Analytics } from "@/lib/analytics-events";
import {
  COMPANY_SIZE_OPTIONS,
  COMPANY_TYPE_OPTIONS,
  DISCOVERY_OPTIONS,
  EMPTY_ANSWERS,
  GOAL_OPTIONS,
  ROLE_OPTIONS,
  TEAM_SIZE_OPTIONS,
  TOOLING_OPTIONS,
  TOTAL_STEPS,
  VOLUME_OPTIONS,
  isStepComplete,
  splitList,
  type OnboardingAnswers,
} from "@/lib/onboarding-questions";

const STEP_TITLES = [
  "What best describes your role?",
  "What type of company are you?",
  "How big is your team?",
  "What are you primarily looking to accomplish?",
  "Who do you sell to?",
  "How do you find prospects today?",
  "Where did you find OutReign?",
];

const STEP_HINTS = [
  "This tailors the language your AI drafts use.",
  "We use this to frame your offer in outreach.",
  "Helps us set sensible sending limits for you.",
  "Pick everything that applies.",
  "This becomes your first targeting profile, so searches start pre-filled.",
  "Nothing changes on your side — this just tells us what to import from.",
  "Genuinely useful to us: it tells us which channels are worth our time.",
];

const OptionButton = ({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors flex items-center justify-between gap-3 ${
      selected
        ? "border-primary bg-primary/10 text-foreground"
        : "border-border bg-card hover:bg-accent/50 hover:border-primary/30 text-foreground"
    }`}
  >
    <span>{label}</span>
    {selected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
  </button>
);

const Onboarding = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>(EMPTY_ANSWERS);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(true);

  const set = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  // Never show the questionnaire to someone who already finished it.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      const { data } = await supabase
        .from("onboarding_progress")
        .select("onboarding_completed")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.onboarding_completed === true) {
        navigate("/dashboard", { replace: true });
        return;
      }
      setChecking(false);
      Analytics.onboardingStarted();
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const canContinue = useMemo(() => isStepComplete(step, answers), [step, answers]);
  const onRecap = step === TOTAL_STEPS;

  const goNext = () => {
    if (!canContinue) return;
    Analytics.onboardingStepCompleted(step + 1);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const toggleGoal = (goal: string) => {
    if (goal === "All of the above") {
      const all = GOAL_OPTIONS.filter((g) => g !== "All of the above") as unknown as string[];
      const already = answers.goals.length === all.length;
      set("goals", already ? [] : [...all]);
      return;
    }
    set(
      "goals",
      answers.goals.includes(goal)
        ? answers.goals.filter((g) => g !== goal)
        : [...answers.goals, goal],
    );
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const size = COMPANY_SIZE_OPTIONS.find((o) => o.label === answers.company_size);

      const { error: respErr } = await supabase.from("onboarding_responses").upsert(
        {
          user_id: user.id,
          role: answers.role,
          company_type: answers.company_type,
          team_size: answers.team_size,
          goals: answers.goals,
          current_tooling: answers.current_tooling,
          monthly_prospect_volume: answers.monthly_prospect_volume,
          discovery_channel: answers.discovery_channel,
          discovery_channel_other:
            answers.discovery_channel === "Other" ? answers.discovery_channel_other.trim() : null,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (respErr) throw respErr;

      // Business description powers email drafting — fill it from their own words.
      await supabase
        .from("profiles")
        .update({ business_description: answers.what_you_sell.trim() })
        .eq("id", user.id);

      // Give them a targeting profile so lead search isn't an empty form.
      const { data: existingIcp } = await supabase
        .from("icp_profiles")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!existingIcp || existingIcp.length === 0) {
        await supabase.from("icp_profiles").insert({
          user_id: user.id,
          name: "My first ICP",
          target_titles: splitList(answers.target_titles),
          industries: splitList(answers.industries),
          company_size_min: size?.min ?? null,
          company_size_max: size?.max ?? null,
          value_proposition: answers.what_you_sell.trim(),
        });
      }

      Analytics.onboardingCompleted(answers.discovery_channel);
      toast.success("You're set up — let's find your first prospects.");
      navigate("/dashboard", { replace: true });
    } catch (error: any) {
      toast.error(`Could not save your answers: ${error?.message ?? "please try again"}`);
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const progress = (Math.min(step, TOTAL_STEPS) / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title="Set up your account" description="Answer a few questions to set up OutReign." noIndex />

      <header className="border-b border-border/60 px-5 py-4 flex items-center gap-2">
        <img src={outReignLogo} alt="OutReign" className="h-6 w-6" width={24} height={24} />
        <span className="font-semibold text-sm">
          Out<span className="text-primary">Reign</span>
        </span>
      </header>

      <main className="flex-1 flex items-start justify-center px-5 py-8 sm:py-12">
        <div className="w-full max-w-xl space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{onRecap ? "All done" : `Question ${step + 1} of ${TOTAL_STEPS}`}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>

          {!onRecap && (
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">{STEP_TITLES[step]}</h1>
              <p className="text-sm text-muted-foreground">{STEP_HINTS[step]}</p>
            </div>
          )}

          <div className="space-y-3">
            {step === 0 &&
              ROLE_OPTIONS.map((o) => (
                <OptionButton key={o} label={o} selected={answers.role === o} onClick={() => set("role", o)} />
              ))}

            {step === 1 &&
              COMPANY_TYPE_OPTIONS.map((o) => (
                <OptionButton
                  key={o}
                  label={o}
                  selected={answers.company_type === o}
                  onClick={() => set("company_type", o)}
                />
              ))}

            {step === 2 &&
              TEAM_SIZE_OPTIONS.map((o) => (
                <OptionButton
                  key={o}
                  label={o}
                  selected={answers.team_size === o}
                  onClick={() => set("team_size", o)}
                />
              ))}

            {step === 3 &&
              GOAL_OPTIONS.map((o) => (
                <OptionButton
                  key={o}
                  label={o}
                  selected={
                    o === "All of the above"
                      ? answers.goals.length === GOAL_OPTIONS.length - 1
                      : answers.goals.includes(o)
                  }
                  onClick={() => toggleGoal(o)}
                />
              ))}

            {step === 4 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="titles">Job titles you target</Label>
                  <Input
                    id="titles"
                    placeholder="VP of Sales, Head of Growth, Founder"
                    value={answers.target_titles}
                    onChange={(e) => set("target_titles", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Separate with commas.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="industries">Industries</Label>
                  <Input
                    id="industries"
                    placeholder="SaaS, Fintech, Logistics"
                    value={answers.industries}
                    onChange={(e) => set("industries", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Company size</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {COMPANY_SIZE_OPTIONS.map((o) => (
                      <OptionButton
                        key={o.label}
                        label={o.label}
                        selected={answers.company_size === o.label}
                        onClick={() => set("company_size", o.label)}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sell">What do you sell, and why do they buy it?</Label>
                  <Textarea
                    id="sell"
                    rows={4}
                    placeholder="We help B2B sales teams book more meetings by finding verified contacts and writing personalized openers."
                    value={answers.what_you_sell}
                    onChange={(e) => set("what_you_sell", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your AI drafts use this, so write it the way you'd say it on a call.
                  </p>
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="space-y-5">
                <div className="space-y-3">
                  <Label>How are you currently finding prospects?</Label>
                  {TOOLING_OPTIONS.map((o) => (
                    <OptionButton
                      key={o}
                      label={o}
                      selected={answers.current_tooling === o}
                      onClick={() => set("current_tooling", o)}
                    />
                  ))}
                </div>
                <div className="space-y-3">
                  <Label>How many prospects do you reach per month?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {VOLUME_OPTIONS.map((o) => (
                      <OptionButton
                        key={o}
                        label={o}
                        selected={answers.monthly_prospect_volume === o}
                        onClick={() => set("monthly_prospect_volume", o)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="space-y-3">
                {DISCOVERY_OPTIONS.map((o) => (
                  <OptionButton
                    key={o}
                    label={o}
                    selected={answers.discovery_channel === o}
                    onClick={() => set("discovery_channel", o)}
                  />
                ))}
                {answers.discovery_channel === "Other" && (
                  <Input
                    placeholder="Where exactly? (a podcast, a friend, a newsletter…)"
                    value={answers.discovery_channel_other}
                    onChange={(e) => set("discovery_channel_other", e.target.value)}
                  />
                )}
              </div>
            )}

            {onRecap && (
              <div className="space-y-5">
                <div className="space-y-1">
                  <h1 className="text-2xl font-semibold">You're ready.</h1>
                  <p className="text-sm text-muted-foreground">
                    We'll target {splitList(answers.target_titles).slice(0, 3).join(", ") || "your buyers"}
                    {splitList(answers.industries).length > 0
                      ? ` in ${splitList(answers.industries).slice(0, 3).join(", ")}`
                      : ""}
                    {answers.company_size && answers.company_size !== "Any size"
                      ? ` at ${answers.company_size.toLowerCase()}`
                      : ""}
                    .
                  </p>
                </div>
                <div className="rounded-lg border border-border/60 bg-card p-4 space-y-2 text-sm">
                  {[
                    ["Role", answers.role],
                    ["Company", answers.company_type],
                    ["Team", answers.team_size],
                    ["Goals", answers.goals.join(", ")],
                    ["Today", answers.current_tooling],
                    ["Volume", `${answers.monthly_prospect_volume} / month`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-right font-medium">{value}</span>
                    </div>
                  ))}
                </div>
                <Button size="lg" className="w-full" onClick={handleFinish} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Rocket className="h-4 w-4 mr-2" />
                      Start your first campaign
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {!onRecap && (
            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <Button
                variant="ghost"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="text-muted-foreground disabled:opacity-30"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={goNext} disabled={!canContinue}>
                Continue
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Onboarding;
