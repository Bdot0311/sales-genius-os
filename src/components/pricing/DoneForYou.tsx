/*
 * The done-for-you offer, deliberately not a sixth tier card.
 *
 * Three reasons it sits in its own section rather than in the plan grid:
 *
 * A $2,500/month card beside a $39 one distorts both. The self-serve tiers
 * stop reading as the product and start reading as the cheap option, which is
 * the opposite of what the pricing page is for.
 *
 * A service is not a plan. Putting it in the grid implies it can be bought by
 * clicking, and it cannot: the offer is capped at five concurrent clients and
 * the delivery runbook requires qualifying a prospect's deal cycle before a
 * seat is committed. The call to action is an application, never checkout.
 *
 * And the founding price is deliberately absent. Publishing the discount
 * alongside the list price makes the list price look invented, and removes the
 * room to negotiate it per client.
 *
 * It renders inside the pricing section, directly beneath the plan cards and
 * above the comparison table, so it brings no container or background of its
 * own. Placed after <Pricing /> instead it landed below the comparison table,
 * the add-ons and the credit FAQ, which reads as an afterthought by the footer
 * rather than as the alternative to the plans above it.
 */

const PURPLE = "hsl(261 75% 50%)";

const INCLUDED = [
  "Domains registered, SPF, DKIM and DMARC configured",
  "Mailboxes connected and warmed before anything sends",
  "ICP built, lists sourced and verified",
  "Sequences written to house style and quality-checked",
  "Campaigns launched and ramped on real placement data",
  "Replies reviewed before the agent responds",
  "Monthly reporting in your own branded portal",
];

export const DoneForYou = () => (
  <section className="mx-auto mb-20 max-w-5xl md:mb-24" aria-labelledby="dfy-heading">
    <div>
      <div>
        <p className="font-serif italic font-thin text-base text-center text-purple-500 mb-4">
          Done for you
        </p>
        <h2
          id="dfy-heading"
          className="font-display text-center mb-3"
          style={{
            fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "hsl(0 0% 95%)",
          }}
        >
          Or we run it for you
        </h2>
        <p
          className="mx-auto mb-10 max-w-xl text-center text-sm leading-relaxed sm:mb-12 sm:text-base"
          style={{ color: "hsl(0 0% 100% / 0.7)" }}
        >
          Five seats at a time. We build the infrastructure, write the
          sequences, run the campaigns, and hand you the replies.
        </p>

        <div
          className="grid gap-px overflow-hidden rounded-2xl md:grid-cols-[1.15fr_1fr]"
          style={{ background: `${PURPLE.slice(0, -1)} / 0.14)`, border: `1px solid ${PURPLE.slice(0, -1)} / 0.18)` }}
        >
          {/* What the engagement covers */}
          <div className="p-6 sm:p-8" style={{ background: "hsl(261 75% 2%)" }}>
            <h3
              className="mb-5 text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ color: "hsl(261 75% 72%)" }}
            >
              What we do
            </h3>
            <ul className="space-y-3">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "hsl(261 75% 62%)" }}
                    aria-hidden="true"
                  />
                  <span
                    className="text-sm leading-relaxed"
                    style={{ color: "hsl(0 0% 100% / 0.78)" }}
                  >
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* The two ways to buy it */}
          <div
            className="flex flex-col justify-between p-6 sm:p-8"
            style={{ background: `${PURPLE.slice(0, -1)} / 0.06)` }}
          >
            <div className="space-y-6">
              <div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="font-display text-3xl font-bold leading-none"
                    style={{ color: "hsl(0 0% 95%)" }}
                  >
                    $2,500
                  </span>
                  <span className="text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                    / month
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium" style={{ color: "hsl(0 0% 100% / 0.85)" }}>
                  Managed
                </p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.62)" }}>
                  We run it. 90-day term. Founding terms available for the first
                  cohort.
                </p>
              </div>

              <div
                className="pt-6"
                style={{ borderTop: `1px solid ${PURPLE.slice(0, -1)} / 0.16)` }}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className="font-display text-2xl font-bold leading-none"
                    style={{ color: "hsl(0 0% 92%)" }}
                  >
                    $1,500
                  </span>
                  <span className="text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                    one-time
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium" style={{ color: "hsl(0 0% 100% / 0.85)" }}>
                  Launch
                </p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.62)" }}>
                  We build it and hand over the keys. You run it from there on
                  your own plan.
                </p>
              </div>
            </div>

            <div className="mt-8">
              <a
                href="https://calendly.com/bdotindustries/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center rounded-full px-4 text-sm font-semibold leading-none transition-opacity duration-200 hover:opacity-90"
                style={{
                  background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))",
                  color: "white",
                }}
              >
                Apply for a seat
              </a>
              {/*
               * The guarantee earns its own line rather than sitting in fine
               * print. It is the strongest thing on this panel and burying it
               * at half opacity wastes it.
               *
               * Bounded on purpose. A refund window is concrete; a promise to
               * refund when it "doesn't work out" is not, and with no measured
               * baseline there is no definition of working to hold either side
               * to. Infrastructure is excluded because the client keeps it.
               */}
              <p
                className="mt-4 text-sm leading-relaxed"
                style={{ color: "hsl(0 0% 100% / 0.72)" }}
              >
                Full refund if you cancel in the first 30 days. You keep the
                domains, the mailboxes and the sequences either way.
              </p>
              {/*
               * Stated rather than left to be asked. The copy rules forbid
               * citing a number we have not measured, and in a category full
               * of invented ones, saying so is worth more than silence.
               */}
              <p
                className="mt-3 text-xs leading-relaxed"
                style={{ color: "hsl(0 0% 100% / 0.5)" }}
              >
                No meeting guarantees, and we do not publish reply-rate claims
                we have not measured.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);
