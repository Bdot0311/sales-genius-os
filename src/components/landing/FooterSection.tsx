import outReignLogo from "@/assets/outreign-logo.webp";
import { Link } from "react-router-dom";
import { helpCategories, helpArticles } from "@/components/help/helpArticles";
import { blogPostsMeta } from "@/data/blog-index";

// Guides and support links are generated from the same content data the pages
// render. Help articles and categories previously had no link path from the
// site's most-crawled page, so Google left them at "Discovered - currently not
// indexed"; these give every one of them a real rendered internal link.
const popularArticles = helpArticles.filter((a) => a.popular).slice(0, 5);
const recentPosts = blogPostsMeta.slice(0, 5);

const footerLinks = {
  product: [
    { label: "Features", href: "#features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Integrations", href: "/pricing" },
    { label: "Sales Ops Software", href: "/sales-operations-software" },
    { label: "Product Demo", href: "/demo" },
    { label: "Connect to AI Agents", href: "/connect" },
  ],
  compare: [
    { label: "vs Apollo", href: "/vs-apollo" },
    { label: "vs Instantly", href: "/vs-instantly" },
    { label: "vs RocketReach", href: "/vs-rocketreach" },
    { label: "vs Lusha", href: "/vs-lusha" },
    { label: "vs ZoomInfo", href: "/vs-zoominfo" },
    { label: "Why Switch", href: "/apollo-alternative" },
  ],
  resources: [
    { label: "Blog", href: "/blog" },
    { label: "Help Center", href: "/help" },
    { label: "Partners", href: "/partners" },
    { label: "API Docs", href: "/api-docs" },
    { label: "API Status", href: "/api-status" },
    ...helpCategories.map((category) => ({
      label: category.title,
      href: `/help/category/${category.id}`,
    })),
  ],
  guides: [
    ...recentPosts.map((post) => ({ label: post.title, href: `/blog/${post.slug}` })),
    ...popularArticles.map((article) => ({
      label: article.title,
      href: `/help/article/${article.slug}`,
    })),
  ],
  legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
    { label: "Security", href: "/security" },
  ],
};


export const FooterSection = () => {
  return (
    <footer className="py-16 md:py-20 border-t" style={{ background: "transparent", borderColor: "hsl(261 75% 50% / 0.18)" }}>
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-6 gap-12 mb-12">
            {/* Brand */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5 mb-4">
                <img 
                  src={outReignLogo} 
                  alt="OutReign Logo"
                  className="w-8 h-8 rounded-lg"
                  width={32}
                  height={32}
                />
                <span className="text-lg font-semibold">
                  <span style={{ color: "hsl(0 0% 92%)" }}>Out</span>
                  <span style={{ color: "hsl(261 75% 65%)" }}>Reign</span>
                </span>
              </div>
              <p className="text-sm max-w-xs leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                Plain-English lead discovery and outbound workflow software for B2B teams that want to move from prospecting to outreach faster.
              </p>
            </div>

            {/* Product */}
            <div>
              <h3 className="font-semibold text-sm mb-4" style={{ color: "hsl(0 0% 92%)" }}>Product</h3>
              <ul className="space-y-3">
                {footerLinks.product.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('/') ? (
                      <Link 
                        to={link.href} 
                        className="text-sm transition-colors duration-150 inline-flex items-center py-2 min-h-[40px] min-w-[40px] px-1" style={{ color: "hsl(0 0% 100% / 0.7)" }} onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a 
                        href={link.href} 
                        className="text-sm transition-colors duration-150 inline-flex items-center py-2 min-h-[40px] min-w-[40px] px-1" style={{ color: "hsl(0 0% 100% / 0.7)" }} onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* Compare */}
            <div>
              <h3 className="font-semibold text-sm mb-4" style={{ color: "hsl(0 0% 92%)" }}>Compare</h3>
              <ul className="space-y-3">
                {footerLinks.compare.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.href}
                      className="text-sm transition-colors duration-150 inline-flex items-center py-2 min-h-[40px] min-w-[40px] px-1" style={{ color: "hsl(0 0% 100% / 0.7)" }} onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h3 className="font-semibold text-sm mb-4" style={{ color: "hsl(0 0% 92%)" }}>Resources</h3>
              <ul className="space-y-3">
                {footerLinks.resources.map((link) => (
                  <li key={link.label}>
                    <Link 
                      to={link.href} 
                      className="text-sm transition-colors duration-150 inline-flex items-center py-2 min-h-[40px] min-w-[40px] px-1" style={{ color: "hsl(0 0% 100% / 0.7)" }} onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h3 className="font-semibold text-sm mb-4" style={{ color: "hsl(0 0% 92%)" }}>Legal</h3>
              <ul className="space-y-3">
                {footerLinks.legal.map((link) => (
                  <li key={link.label}>
                    <Link 
                      to={link.href} 
                      className="text-sm transition-colors duration-150 inline-flex items-center py-2 min-h-[40px] min-w-[40px] px-1" style={{ color: "hsl(0 0% 100% / 0.7)" }} onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")} onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Guides — latest articles, so every content page has one real internal link */}
          <div className="mb-12 pt-8 border-t" style={{ borderColor: "hsl(261 75% 50% / 0.18)" }}>
            <h3 className="font-semibold text-sm mb-4" style={{ color: "hsl(0 0% 92%)" }}>Guides &amp; popular articles</h3>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1">
              {footerLinks.guides.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-sm transition-colors duration-150 inline-flex items-center py-2 min-h-[40px] px-1"
                    style={{ color: "hsl(0 0% 100% / 0.7)" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 65%)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>



          {/* Google API Disclosure */}
          <div id="google-api-disclosure" className="mb-8 p-6 rounded-xl border" style={{ background: "hsl(240 30% 10%)", borderColor: "hsl(261 75% 50% / 0.25)" }}>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "hsl(0 0% 92%)" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "hsl(261 75% 65%)" }}><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>
              How OutReign Uses Google User Data
            </h3>
            <div className="text-sm space-y-3" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
              <p>
                OutReign requests access to your Gmail data solely to enable outbound email features within the platform. Specifically, we access your Gmail account to:
              </p>
              <ul className="space-y-1.5 ml-4">
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                  <span><strong style={{ color: "hsl(0 0% 85%)" }}>Send outbound emails</strong> — messages composed and sent through OutReign on your behalf</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                  <span><strong style={{ color: "hsl(0 0% 85%)" }}>Read reply data</strong> — detect replies to your outreach for tracking and analytics</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                  <span><strong style={{ color: "hsl(0 0% 85%)" }}>Detect open events</strong> — tracking pixels to measure engagement with your sent emails</span>
                </li>
              </ul>
              <p>
                Our use of Google user data complies with the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "hsl(261 75% 65%)" }}>Google API Services User Data Policy</a>, including the <strong style={{ color: "hsl(0 0% 85%)" }}>Limited Use</strong> requirements. We do not use Gmail data for advertising, we do not sell it to third parties, we do not use it to train AI models outside your account, and no human reads your messages.
              </p>
              <p>
                You can revoke OutReign's access to your Gmail data at any time via your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "hsl(261 75% 65%)" }}>Google Account permissions</a> or by disconnecting the integration in your OutReign settings.
              </p>
            </div>
          </div>

          {/* Bottom */}
          <div className="pt-8 border-t flex flex-col items-center gap-4" style={{ borderColor: "hsl(261 75% 50% / 0.18)" }}>
            <div
              className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-4xl [&_a]:flex [&_a]:h-14 [&_a]:items-center [&_a]:justify-center [&_a]:rounded-lg [&_a]:px-3 [&_a]:transition-colors [&_a]:duration-150 [&_img]:max-h-8 [&_img]:w-auto [&_img]:object-contain"
              style={{ ["--chip-bg" as any]: "hsl(240 30% 10%)", ["--chip-border" as any]: "hsl(261 75% 50% / 0.18)" }}
            >
              {(
                [
                  { href: "https://sellwithboost.com", src: "https://sellwithboost.com/badge/listing-dark.svg", alt: "Listed on Sell With Boost", w: 160, h: 40 },
                  { href: "https://landingboost.app/badges/top-1", src: "https://landingboost.app/badges/top1-dark.svg", alt: "Top 1% Landing Page — Verified by LandingBoost", w: 200, h: 40 },
                  { href: "https://nicklaunches.com/products/salesos/?utm_source=outreign.io&utm_medium=badge&utm_campaign=featured", src: "https://nicklaunches.com/badges/featured-dark.svg", alt: "OutReign on Nick Launches", w: 244, h: 56 },
                  { href: "https://plugyourbuild.com/listing/outreign-b8ad99", src: "https://plugyourbuild.com/api/badge/outreign-b8ad99?style=dark", alt: "Listed on Plug Your Build", w: 180, h: 40 },
                  { href: "https://rankinpublic.xyz/products/outreign.io", src: "https://rankinpublic.xyz/api/badges/badge-featured.png?site=outreign.io", alt: "Featured on RankInPublic", w: 125, h: 40 },
                  { href: "https://www.producthunt.com/products/outreign-io?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-outreign-io", src: "https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1174023&theme=dark&t=1781681273997", alt: "OutReign.io - Find who to sell to then close them. | Product Hunt", w: 250, h: 54 },
                  { href: "https://launchllama.co?utm_source=badge&utm_medium=referral", src: "https://speaktechenglish.com/wp-content/uploads/2026/04/Screenshot_2026-04-09_at_17.40.44-removebg-preview.png", alt: "Featured on Launch Llama", w: 200, h: 50 },
                  { href: "https://launchigniter.com/product/outreign-io?ref=badge-outreign-io", src: "https://launchigniter.com/api/badge/outreign-io?theme=dark", alt: "Featured on LaunchIgniter", w: 212, h: 55 },
                  { href: "https://smollaunchpad.com/projects/outreign", src: "https://r2.direasy-multi-tenant.focusapps.app/uploads/616d0b1a-3979-4b8c-94d1-b4f1fedd3aed/1783046766775/sjxeszczb3i/top1-dark.svg", alt: "Smol LaunchPad Top 1 Daily Winner", w: 195, h: 60 },
                  { href: "https://spacerrapps.com/apps/outreign?ref=badge", src: "https://spacerrapps.com/badge/outreign.svg?theme=light", alt: "OutReign is featured on Spacerr", w: 192, h: 54 },
                  { href: "https://boostdomainrating.com/item/outreign.io?utm_source=badge", src: "https://boostdomainrating.com/api/badge/outreign.io?color=dark", alt: "OutReign - Domain Rating", w: 212, h: 54 },
                ] as Array<{ href: string; src: string; alt: string; w: number; h: number } | { href: string; html: string; alt: string }>
              ).concat({ href: "https://everlist.dev/tools/outreign", html: `<a href="https://everlist.dev/tools/outreign" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:10px;padding:8px 14px;background:#0B0B0F;color:#FFFFFF;border:1px solid #23232B;border-radius:9999px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px;line-height:1;text-decoration:none;"><span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:#D4AF37;color:#0B0B0F;font-weight:700;font-size:12px;">E</span><span style="display:inline-flex;flex-direction:column;gap:2px;"><span style="font-size:9px;letter-spacing:1.4px;text-transform:uppercase;color:#9A9AA8;">Listed on</span><span style="font-weight:600;letter-spacing:-0.01em;"><span style="color:#FFFFFF">Ever</span><span style="color:#D4AF37">List</span></span></span></a>`, alt: "Listed on EverList" }).map((b) => {
                const sharedProps = {
                  href: b.href,
                  target: "_blank" as const,
                  rel: "noopener noreferrer" as const,
                  style: { background: "hsl(240 30% 10%)", border: "1px solid hsl(261 75% 50% / 0.18)" } as React.CSSProperties,
                  onMouseEnter: (e: React.MouseEvent<HTMLAnchorElement>) => { (e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 55% / 0.45)"; },
                  onMouseLeave: (e: React.MouseEvent<HTMLAnchorElement>) => { (e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.18)"; },
                };
                if ("html" in b) {
                  return <a key={b.href} {...sharedProps} dangerouslySetInnerHTML={{ __html: b.html }} />;
                }
                return (
                  <a key={b.href} {...sharedProps}>
                    <img src={b.src} alt={b.alt} width={b.w} height={b.h} loading="lazy" />
                  </a>
                );
              })}
            </div>
            <p className="text-sm text-center" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
              © {new Date().getFullYear()} BDØT Industries LLC. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
