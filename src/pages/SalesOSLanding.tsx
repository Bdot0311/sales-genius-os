import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ChevronRight, Menu, Search, Sparkles,
  Star, Send, FileText, Archive, Trash2,
  Reply, Forward, MoreHorizontal, Paperclip, Inbox,
} from 'lucide-react';

// ── SVG primitives ───────────────────────────────────────────────────────

const AppleLogo = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg viewBox="0 0 384 512" fill="currentColor" className={className}>
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);

const LogoMark = ({ className = 'w-8 h-8' }: { className?: string }) => (
  <svg viewBox="0 0 256 256" fill="white" className={className}>
    <path d="M 0 128 C 70.692 128 128 185.308 128 256 L 64 256 C 64 220.654 35.346 192 0 192 Z M 256 192 C 220.654 192 192 220.654 192 256 L 128 256 C 128 185.308 185.308 128 256 128 Z M 128 0 C 128 70.692 70.692 128 0 128 L 0 64 C 35.346 64 64 35.346 64 0 Z M 192 0 C 192 35.346 220.654 64 256 64 L 256 128 C 185.308 128 128 70.692 128 0 Z" />
  </svg>
);

// Root SVG noise filter — referenced by the shiny headline gradient
const NoiseFilter = () => (
  <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
    <defs>
      <filter id="c3-noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.35 0" />
        <feComposite in2="SourceGraphic" operator="in" result="noise" />
        <feBlend in="SourceGraphic" in2="noise" mode="multiply" />
      </filter>
    </defs>
  </svg>
);

// ── Shared components ────────────────────────────────────────────────────

interface AppleButtonProps { label?: string; full?: boolean; }
const AppleButton = ({ label = 'Download SalesOS', full }: AppleButtonProps) => (
  <button
    className={`group inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-medium text-sm px-5 py-3 transition-all hover:bg-white/90 active:scale-[0.98]${full ? ' w-full' : ''}`}
  >
    <AppleLogo className="w-4 h-4" />
    {label}
    <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-[1px]" />
  </button>
);

interface SectionEyebrowProps { label: string; tag?: string; }
const SectionEyebrow = ({ label, tag }: SectionEyebrowProps) => (
  <div className="flex items-center gap-3">
    <span className="w-1.5 h-1.5 rounded-full bg-white" />
    <span className="text-xs text-white/60 font-medium">{label}</span>
    {tag && (
      <span className="px-2 py-0.5 rounded-full border border-white/10 text-white/50 text-xs">{tag}</span>
    )}
  </div>
);

const gradientStyle: React.CSSProperties = {
  backgroundImage: 'linear-gradient(to right, #091020 0%, #0B2551 12.5%, #A4F4FD 32.5%, #00d2ff 50%, #0B2551 67.5%, #091020 87.5%, #091020 100%)',
  backgroundSize: '200% auto',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitTextFillColor: 'transparent',
  filter: 'url(#c3-noise)',
};

// ── Section 1 — Navbar ───────────────────────────────────────────────────

const navLinks = ['Solutions', 'Pricing', 'Blog', 'Documentation', 'Enterprise'];

const NavBar = () => (
  <motion.nav
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, ease: 'easeOut' }}
    className="relative z-20 w-full py-5"
  >
    <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
      <LogoMark />
      <div className="hidden md:flex gap-8">
        {navLinks.map((link, i) => (
          <motion.a
            key={link}
            href="#"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
            className="text-white/70 text-sm font-medium hover:text-white transition-colors"
          >
            {link}
          </motion.a>
        ))}
      </div>
      <div className="hidden md:flex">
        <AppleButton />
      </div>
      <button className="md:hidden w-10 h-10 rounded-full border border-white/10 bg-white/5 flex items-center justify-center">
        <Menu className="w-4 h-4" />
      </button>
    </div>
  </motion.nav>
);

// ── Section 2 — Hero ─────────────────────────────────────────────────────

const Hero = () => (
  <section className="relative z-10 pt-16 md:pt-28 pb-20 text-center flex flex-col items-center">
    <motion.h1
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="text-4xl md:text-7xl font-semibold tracking-tight leading-[0.9]"
    >
      <span className="block text-white">Your revenue.</span>
      <span className="block animate-shiny" style={gradientStyle}>Amplified</span>
    </motion.h1>
    <motion.p
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.6 }}
      className="mt-8 text-white/60 max-w-md text-base leading-[1.5]"
    >
      SalesOS is the premier pipeline platform for the current era. It leverages powerful AI
      to find, prioritize, and close your highest-value deals with total clarity.
    </motion.p>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7, duration: 0.6 }}
      className="mt-10 flex flex-col items-center gap-3"
    >
      <AppleButton />
      <span className="text-xs text-white/40">Download for Intel / Apple Silicon</span>
    </motion.div>
  </section>
);

// ── Section 3 — macOS menu bar ───────────────────────────────────────────

const menuBarItems = ['File', 'Edit', 'View', 'Deals', 'Window', 'Help'];

const MacOSMenuBar = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 0.9, duration: 0.5 }}
    className="relative z-10 w-full h-10 bg-black/40 backdrop-blur-md border-t border-b border-white/10"
  >
    <div className="max-w-6xl mx-auto px-6 h-full flex items-center justify-between text-xs">
      <div className="flex items-center gap-4">
        <AppleLogo className="w-3.5 h-3.5" />
        <span className="font-bold text-white">SalesOS</span>
        {menuBarItems.map((item, i) => (
          <span
            key={item}
            className={`text-white/70 cursor-default${i > 2 ? ' hidden sm:inline' : ''}${i > 3 ? ' hidden md:inline' : ''}`}
          >
            {item}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 text-white/60">
        <Search className="w-3.5 h-3.5" />
        <span>Wed May 6 1:09 PM</span>
      </div>
    </div>
  </motion.div>
);

// ── Section 4 — Pipeline mockup ──────────────────────────────────────────

const deals = [
  { company: 'Acme Corp',    title: 'Enterprise License',   preview: 'Ready to review contract terms and finalize the deal...',  time: '9:41 AM',   unread: true,  active: true  },
  { company: 'TechFlow Inc', title: 'Platform Expansion',   preview: 'Following up on the proposal we discussed last week...',   time: '8:12 AM',   unread: true,  active: false },
  { company: 'Quantum Labs', title: 'Annual SaaS Contract', preview: 'Thanks for the demo. Ready to move forward with this...',  time: 'Yesterday', unread: false, active: false },
  { company: 'DataVault',    title: 'Series B Partnership', preview: 'Under internal review by our procurement team right now.', time: 'Yesterday', unread: false, active: false },
  { company: 'NeuralCore',   title: 'Pilot Program',        preview: 'Pilot setup confirmed for next Monday at 10 AM PST...',    time: 'Mon',       unread: false, active: false },
  { company: 'CloudScale',   title: 'Migration Deal',       preview: 'david-lim approved the migration proposal terms.',         time: 'Mon',       unread: false, active: false },
];

const sidebarNav = [
  { icon: Inbox,    label: 'All Deals',   count: 12, active: true  },
  { icon: Star,     label: 'Hot',         count: 3,  active: false },
  { icon: Send,     label: 'Active',                 active: false },
  { icon: FileText, label: 'Proposals',   count: 2,  active: false },
  { icon: Archive,  label: 'Closed Won',             active: false },
  { icon: Trash2,   label: 'Closed Lost',            active: false },
];

const sidebarLabels = [
  { label: 'Enterprise', color: '#00d2ff' },
  { label: 'SaaS',       color: '#A4F4FD' },
  { label: 'SMB',        color: '#f59e0b' },
  { label: 'Partnership',color: '#10b981' },
];

const PipelineMockup = () => (
  <section className="relative z-10 max-w-6xl mx-auto px-6 py-16 md:py-24">
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: 1.1, duration: 0.8 }}
      className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0e1014]/90 backdrop-blur-2xl"
    >
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 bg-black/20">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
          <span className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
          <span className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
        </div>
        <span className="text-xs text-white/50">SalesOS — All Deals</span>
        <div className="w-14" />
      </div>

      {/* 12-col body grid */}
      <div className="grid h-[520px]" style={{ gridTemplateColumns: 'repeat(12, minmax(0, 1fr))' }}>

        {/* Sidebar — col 1–3 */}
        <div className="col-span-3 border-r border-white/10 bg-black/30 p-4 flex flex-col gap-3 overflow-hidden">
          <button className="flex items-center gap-1.5 rounded-lg bg-white text-black text-xs font-semibold px-3 py-2 w-full">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Prospect with SalesOS</span>
          </button>
          <div className="flex flex-col gap-0.5 mt-1">
            {sidebarNav.map(({ icon: Icon, label, count, active }) => (
              <div
                key={label}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-default transition-colors ${
                  active ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{label}</span>
                {count != null && (
                  <span className={`text-[10px] ${active ? 'text-white/70' : 'text-white/40'}`}>{count}</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-[9px] uppercase tracking-widest text-white/30 mb-2">Segments</p>
            {sidebarLabels.map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2 py-1 text-xs text-white/50 cursor-default">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Deal list — col 4–7 */}
        <div className="col-span-4 border-r border-white/10 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-black/10 shrink-0">
            <Search className="w-3 h-3 text-white/30 shrink-0" />
            <span className="text-xs text-white/30">Search deals</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {deals.map((deal, i) => (
              <div
                key={i}
                className={`px-3 py-2.5 border-b border-white/[0.06] cursor-default transition-colors ${
                  deal.active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className={`text-xs truncate ${deal.unread ? 'font-semibold text-white' : 'font-medium text-white/70'}`}>
                    {deal.company}
                  </span>
                  <span className="text-[10px] text-white/40 shrink-0">{deal.time}</span>
                </div>
                <div className="text-[11px] text-white/70 truncate mt-0.5">{deal.title}</div>
                <div className="text-[10px] text-white/40 truncate mt-0.5">{deal.preview}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Deal reader — col 8–12 */}
        <div className="col-span-5 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-black/10 shrink-0">
            <div className="flex items-center gap-1">
              {([Reply, Forward, Archive, Trash2] as const).map((Icon, i) => (
                <button key={i} className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-white/50" />
                </button>
              ))}
            </div>
            <button className="w-7 h-7 rounded-md hover:bg-white/5 flex items-center justify-center">
              <MoreHorizontal className="w-3.5 h-3.5 text-white/50" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white">Enterprise License — Acme Corp</h3>

            {/* Deal header row */}
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                style={{ background: 'linear-gradient(135deg, #00d2ff, #0B2551)' }}
              >
                A
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white/90">Acme Corp</div>
                <div className="text-[10px] text-white/40">Sarah Chen · $84,000 · 9:41 AM</div>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-white/10 text-white/50 shrink-0">
                Proposal
              </span>
            </div>

            {/* AI summary */}
            <div className="liquid-glass rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: '#A4F4FD' }} />
                <span className="text-[11px] font-semibold text-white/80">Deal Summary by SalesOS</span>
              </div>
              <p className="text-[11px] text-white/60 leading-[1.5]">
                High-intent buyer. Budget confirmed at $84K. Legal review in progress. Decision expected
                Friday. Recommend: send final contract today.
              </p>
            </div>

            {/* Deal body */}
            <div className="space-y-3 text-xs text-white/70 leading-[1.6]">
              <p>Hi team,</p>
              <p>
                Following our product demo last week, we've completed our internal evaluation and the team
                is fully aligned on moving forward with the enterprise license.
              </p>
              <p>
                The legal team has reviewed the initial contract and has a few minor redlines they'll send
                over by end of day. We're targeting signature by Friday.
              </p>
              <p>Looking forward to getting this finalized and moving to onboarding next week.</p>
              <p className="text-white/50">— Sarah Chen, VP Engineering, Acme Corp</p>
            </div>

            {/* Attachment pill */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03] w-fit">
              <Paperclip className="w-3 h-3 text-white/40 shrink-0" />
              <span className="text-[11px] text-white/50">contract-v2-final.pdf</span>
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  </section>
);

// ── Section 5 — Feature: AI pipeline ────────────────────────────────────

const triage = [
  { label: 'Hot',       count: 4, color: '#ffffff', items: ['Acme Corp — $84K contract',    'TechFlow — $120K expansion']   },
  { label: 'Follow-up', count: 7, color: '#e5e5e5', items: ['Quantum Labs — proposal sent', 'DataVault — demo scheduled']   },
  { label: 'Nurture',   count: 4, color: '#a3a3a3', items: ['NeuralCore — pilot active',    'CloudScale — migration quote']  },
  { label: 'Cold',      count: 3, color: '#525252', items: ['Stale deals · Inactive leads']                                 },
];

const FeaturePipeline = () => (
  <section className="max-w-6xl mx-auto px-6 py-20 md:py-28">
    <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-start">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
      >
        <SectionEyebrow label="Pipeline" tag="AI-native" />
        <h2 className="mt-5 text-3xl md:text-5xl font-semibold tracking-tight leading-[1.02]">
          Close every deal<br />in a single pass.
        </h2>
        <p className="mt-6 text-white/60 text-base leading-[1.6] max-w-md">
          SalesOS reads every deal signal, understands buyer intent, and routes your attention
          to the highest-value opportunities. Focus on closing — the rest handles itself.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          {['Auto-prioritize', 'Deal scoring', 'Stale alerts', 'One-tap follow-up'].map((chip) => (
            <span
              key={chip}
              className="text-xs text-white/70 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]"
            >
              {chip}
            </span>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, delay: 0.1 }}
        className="liquid-glass rounded-2xl p-5"
      >
        <p className="text-xs text-white/40 mb-4">Today · 18 deals analyzed</p>
        <div className="flex flex-col gap-3">
          {triage.map(({ label, count, color, items }) => (
            <div key={label} className="liquid-glass rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-xs font-medium text-white/80">{label}</span>
                <span className="text-[10px] text-white/40 ml-auto">{count}</span>
              </div>
              {items.map((item) => (
                <p key={item} className="text-[11px] text-white/50 leading-[1.6] ml-4">{item}</p>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  </section>
);

// ── Section 6 — Logo cloud ───────────────────────────────────────────────

const logos = ['Linear', 'Vercel', 'Figma', 'Stripe', 'Ramp', 'Notion', 'Loom', 'Arc'];

const LogoCloud = () => (
  <section className="max-w-6xl mx-auto px-6 py-16 md:py-20">
    <p className="text-center text-xs uppercase tracking-widest text-white/40">
      Trusted by the world's most ambitious revenue teams
    </p>
    <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-6">
      {logos.map((logo, i) => (
        <motion.div
          key={logo}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.05 }}
          className="flex items-center justify-center"
        >
          <span className="text-sm font-semibold tracking-tight text-white/50 hover:text-white transition-colors cursor-default">
            {logo}
          </span>
        </motion.div>
      ))}
    </div>
  </section>
);

// ── Section 7 — Testimonials ─────────────────────────────────────────────

const testimonials = [
  {
    quote: 'SalesOS gave our AEs three hours of prime selling time back each week. The AI pipeline prioritization alone paid for itself in the first month.',
    name: 'Parker Wilf',
    role: 'Group Product Manager',
    company: 'MERCURY',
  },
  {
    quote: "The deal scoring engine transformed how we manage pipeline. I can't imagine going back to manual CRM updates and gut-feel forecasting.",
    name: 'Andrew von Rosenbach',
    role: 'Senior Engineering Program Manager',
    company: 'COHERE',
  },
  {
    quote: 'Pipeline intelligence that actually understands deal context. Our team stopped losing deals to silent churn and forgotten follow-ups.',
    name: 'Mathies Christensen',
    role: 'Engineering Manager',
    company: 'LUNAR',
  },
];

const Testimonials = () => (
  <section className="max-w-6xl mx-auto px-6 py-20 md:py-28 border-t border-white/10">
    <div className="grid md:grid-cols-3 gap-6">
      {testimonials.map(({ quote, name, role, company }, i) => (
        <motion.figure
          key={i}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.1, duration: 0.6 }}
          className="liquid-glass rounded-2xl p-6"
        >
          <blockquote className="text-sm text-white/80 leading-[1.6]">"{quote}"</blockquote>
          <figcaption className="mt-6 pt-5 border-t border-white/10">
            <p className="text-sm font-semibold text-white">{name}</p>
            <p className="text-xs text-white/50">{role}</p>
            <p className="text-xs text-white font-semibold tracking-wide uppercase mt-0.5">{company}</p>
          </figcaption>
        </motion.figure>
      ))}
    </div>
  </section>
);

// ── Section 8 — Pricing ──────────────────────────────────────────────────

const plans = [
  {
    tier: 'Free',
    price: { monthly: 'Free', yearly: 'Free' },
    desc: 'For individual reps just getting started with AI-powered prospecting.',
    features: [
      'Up to 100 leads per month',
      'Basic email finder',
      'Chrome extension included',
      '1 active pipeline view',
      'Access via web and mobile app',
    ],
    pro: false,
  },
  {
    tier: 'Standard',
    price: { monthly: '$9/m', yearly: '$89/y' },
    desc: 'For growing sales teams who need pipeline intelligence at scale.',
    features: [
      '2,000 verified leads per month',
      'SMTP-verified business emails',
      'Advanced ICP filters',
      'Team workspace (up to 5 seats)',
      'AI deal scoring + buyer signals',
    ],
    pro: false,
  },
  {
    tier: 'Pro',
    price: { monthly: '$29/m', yearly: '$289/y' },
    desc: 'For revenue orgs and agencies closing enterprise deals at scale.',
    features: [
      'Unlimited leads and exports',
      'Highest-confidence verification',
      'AI pipeline automation',
      'Unlimited team members',
      'Full CRM integrations',
    ],
    pro: true,
  },
];

const Pricing = () => {
  const [yearly, setYearly] = useState(false);
  return (
    <section className="c3-pricing-section">
      {/* Pricing-section noise filter (overlay blend) */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden="true">
        <defs>
          <filter id="c3-noise-pricing">
            <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves={2} stitchTiles="stitch" />
            <feComponentTransfer><feFuncA type="linear" slope={0.075} /></feComponentTransfer>
            <feComposite in2="SourceGraphic" operator="in" result="noise" />
            <feBlend in="SourceGraphic" in2="noise" mode="overlay" />
          </filter>
        </defs>
      </svg>

      {/* Giant watermark */}
      <div className="c3-watermark-container">
        <div className="c3-watermark-main">
          <span className="c3-watermark-line-1">Your revenue.</span>
          <span className="c3-watermark-line-2">Amplified</span>
        </div>
      </div>

      {/* Plan cards */}
      <div className="c3-grid">
        {plans.map(({ tier, price, desc, features, pro }) => (
          <div key={tier} className={`c3-card${pro ? ' c3-card-pro' : ''}`}>
            <p className="c3-tier-small">{tier}</p>
            <p className="c3-tier-large">{yearly ? price.yearly : price.monthly}</p>
            <p className="c3-desc">{desc}</p>
            <ul className="c3-list">
              {features.map((f) => (
                <li key={f}>
                  <span className="c3-check">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <button className="c3-btn">Choose Plan</button>
          </div>
        ))}
      </div>

      {/* Billing toggle */}
      <div className="c3-toggle-wrap">
        <span style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.6)' }}>Yearly</span>
        <button
          className={`c3-toggle${yearly ? ' active' : ''}`}
          onClick={() => setYearly(!yearly)}
          aria-label="Toggle yearly billing"
        >
          <div className="c3-toggle-knob" />
        </button>
      </div>
    </section>
  );
};

// ── Section 9 — Final CTA ────────────────────────────────────────────────

const FinalCTA = () => (
  <section className="max-w-6xl mx-auto px-6 py-20 md:py-32">
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      className="liquid-glass relative overflow-hidden rounded-3xl px-8 py-16 md:py-24 text-center"
    >
      {/* Radial glow overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(600px circle at 50% 0%, rgba(255,255,255,0.15), transparent 70%)',
          opacity: 0.3,
        }}
      />
      <div className="relative z-10">
        <h2 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.02]">
          Close the tabs.<br />Open your pipeline.
        </h2>
        <p className="mt-6 text-white/60 max-w-md mx-auto text-sm leading-[1.6]">
          Join thousands of AEs, founders, and revenue operators who treat sales like a system
          — not a grind.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <AppleButton label="Download SalesOS" />
          <button className="group inline-flex items-center gap-2 rounded-full border border-white/15 text-white text-sm font-medium px-5 py-3 hover:bg-white/5 transition-colors">
            Talk to sales
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-[1px]" />
          </button>
        </div>
      </div>
    </motion.div>
  </section>
);

// ── Root export ──────────────────────────────────────────────────────────

export default function SalesOSLanding() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0c0c0c] text-white selection:bg-brand/30">
      {/* Full-screen background video */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover pointer-events-none"
          style={{ height: '100%' }}
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260508_064122_c4750c0e-7476-4b44-94a2-a85a65c63bf2.mp4"
        />
      </div>

      {/* Vertical guide lines (desktop only) */}
      <div className="hidden md:block pointer-events-none fixed inset-y-0 left-1/2 -translate-x-[calc(50%+36rem)] w-px bg-white/10 z-[5]" />
      <div className="hidden md:block pointer-events-none fixed inset-y-0 left-1/2 translate-x-[calc(-50%+36rem)] w-px bg-white/10 z-[5]" />

      {/* Root noise filter for shiny headline */}
      <NoiseFilter />

      <NavBar />
      <Hero />
      <MacOSMenuBar />
      <PipelineMockup />
      <FeaturePipeline />
      <LogoCloud />
      <Testimonials />
      <Pricing />
      <FinalCTA />
    </div>
  );
}
