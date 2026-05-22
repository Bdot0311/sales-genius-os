import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

const featured = [
  {
    slug: "apollo-vs-instantly-vs-salesloft",
    eyebrow: "Comparison",
    title: "Apollo vs Instantly vs Salesloft: which one should you actually use?",
    blurb: "Side-by-side breakdown of pricing, data quality, and deliverability across the three most-asked alternatives.",
  },
  {
    slug: "apollo-alternative-for-founders",
    eyebrow: "Guide",
    title: "The best Apollo alternative for founders doing their own outbound",
    blurb: "Why Apollo's pricing and bounce rate punish small teams — and what to use instead.",
  },
  {
    slug: "how-to-find-b2b-leads-without-boolean-search",
    eyebrow: "How-to",
    title: "How to find B2B leads without boolean search",
    blurb: "Describe your ICP in plain English and skip the filter-stacking. A 3-minute walkthrough.",
  },
];

export const BlogStrip = () => {
  return (
    <section
      className="relative px-5 py-20 sm:px-6 sm:py-28 overflow-hidden"
      style={{
        background: "hsl(261 75% 2%)",
        borderTop: "1px solid hsl(261 75% 50% / 0.18)",
        borderBottom: "1px solid hsl(261 75% 50% / 0.18)",
      }}
      aria-labelledby="resources-heading"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 60% 50% at 50% 50%, hsl(261 75% 55% / 0.06) 0%, transparent 65%)" }}
        aria-hidden="true"
      />
      <div className="mx-auto max-w-6xl relative z-10">
        <div className="mb-10 sm:mb-14">
          <p className="font-serif italic font-thin text-base text-purple-500 mb-5">
            Resources
          </p>
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <h2
              id="resources-heading"
              className="font-display"
              style={{
                fontSize: "clamp(2.4rem, 5vw, 4rem)",
                fontWeight: 800,
                lineHeight: 1.06,
                letterSpacing: "-0.02em",
                color: "hsl(0 0% 95%)",
              }}
            >
              Picking the right outbound stack?
            </h2>
            <Link
              to="/blog"
              className="group inline-flex items-center gap-1.5 text-sm transition-colors shrink-0"
              style={{ color: "hsl(261 75% 65%)" }}
            >
              All articles
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          {featured.map((post, i) => (
            <motion.div
              key={post.slug}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                to={`/blog/${post.slug}`}
                className="group flex h-full flex-col rounded-2xl p-6 transition-all duration-300"
                style={{
                  border: "1px solid hsl(261 75% 50% / 0.12)",
                  background: "hsl(261 75% 50% / 0.04)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 55% / 0.3)";
                  (e.currentTarget as HTMLElement).style.background = "hsl(261 75% 50% / 0.07)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.12)";
                  (e.currentTarget as HTMLElement).style.background = "hsl(261 75% 50% / 0.04)";
                }}
              >
                <p
                  className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em]"
                  style={{ color: "hsl(261 75% 65% / 0.7)" }}
                >
                  {post.eyebrow}
                </p>
                <h3
                  className="mb-3 font-display text-lg font-semibold leading-snug"
                  style={{ color: "hsl(0 0% 92%)" }}
                >
                  {post.title}
                </h3>
                <p
                  className="mb-6 flex-1 text-sm leading-relaxed"
                  style={{ color: "hsl(0 0% 100% / 0.7)" }}
                >
                  {post.blurb}
                </p>
                <span
                  className="inline-flex items-center gap-1.5 text-sm font-medium"
                  style={{ color: "hsl(261 75% 65%)" }}
                >
                  Read
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
