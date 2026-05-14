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
      className="relative px-5 py-20 sm:px-6 sm:py-28"
      aria-labelledby="resources-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 sm:mb-14 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-violet-400/80">
              Resources
            </p>
            <h2
              id="resources-heading"
              className="font-display text-3xl font-bold text-white sm:text-4xl"
              style={{ letterSpacing: "-0.01em" }}
            >
              Picking the right outbound stack?
            </h2>
          </div>
          <Link
            to="/blog"
            className="group inline-flex items-center gap-1.5 text-sm text-white/60 transition-colors hover:text-white"
          >
            All articles
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
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
                className="group flex h-full flex-col rounded-2xl border border-white/8 bg-white/[0.02] p-6 transition-all duration-300 hover:border-violet-500/30 hover:bg-white/[0.04]"
              >
                <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-violet-400/70">
                  {post.eyebrow}
                </p>
                <h3 className="mb-3 font-display text-lg font-semibold leading-snug text-white">
                  {post.title}
                </h3>
                <p className="mb-6 flex-1 text-sm leading-relaxed text-white/55">
                  {post.blurb}
                </p>
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-violet-400">
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
