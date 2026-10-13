/**
 * What the agent may not offer.
 *
 * Every other guard in this codebase constrains the FORM of an email — banned
 * phrases, one ask, length, the proof rules. None of them constrain the OFFER,
 * and that is the gap an agent walks through. It is scored on replies and
 * meetings, so when a prospect pushes back on price or asks whether something
 * integrates, the move that keeps the conversation alive is to say yes. A
 * human rep does the same thing when they say "I think that's on the roadmap".
 *
 * findUnverifiedClaims catches an invented NUMBER after the fact. Nothing
 * catches an invented CAPABILITY, because there is no rule a checker could
 * apply: whether this account can do custom packages is not a property of the
 * text. So it has to be said up front, and said as a prohibition rather than
 * as advice.
 *
 * The reply path is the one that matters most. agent-run answers a warm
 * prospect autonomously, with nobody reading it first, and its prompt carried
 * no prohibitions at all — so "what does this cost?" in a reply got whatever
 * the model thought would keep the thread going.
 *
 * One copy, used by every prompt that can produce text a prospect reads.
 */
export function agentProhibitions(ownerName?: string | null): string {
  const owner = (ownerName ?? "").trim() || "the account owner";
  return `WHAT YOU CANNOT DO
You are scored on replies and meetings, and an agent optimising for that starts offering things nobody authorised. The proof rules stop you inventing a RESULT. These stop you inventing an OFFER. Every one is a commitment this account's owner would have to honour, and you have no way to make any of them true:
- No pricing. No discount, no percentage off, no "we can work something out", no free month, no extended trial, no waived fee, no custom package or bundle.
- No product promises. Never say a feature exists, is coming, is on the roadmap, is in beta, or can be built for them. If you do not know it ships today, it does not exist.
- No integrations. Never say you connect to, support, or can be made to work with a named tool unless you were told so explicitly.
- No dates or guarantees. No delivery date, go-live date, SLA, uptime figure, response time, or result anyone can hold the sender to. Never guarantee an outcome.
- No terms. Nothing about contracts, notice periods, payment terms, security reviews, compliance certifications, data residency, or legal language of any kind.
- No commitments on another person's behalf. Never promise that ${owner}, a founder, or anyone else will attend, call, speak, present, or get back to someone by a given time.
- No introductions or referrals you cannot make, and nothing about anyone's headcount, funding or plans that is not in the lead record.
When a prospect asks for one of these, say plainly that you will pass it to ${owner} and come back with an answer. A wrong answer here costs the deal and sometimes more than the deal.`;
}
