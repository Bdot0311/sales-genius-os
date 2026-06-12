import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px;
    height: 630px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #050208;
    color: white;
    position: relative;
  }

  /* Grid dots */
  body::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px);
    background-size: 32px 32px;
    pointer-events: none;
  }

  /* Purple glow top-left */
  .glow-tl {
    position: absolute;
    top: -80px;
    left: -80px;
    width: 480px;
    height: 480px;
    background: radial-gradient(ellipse, rgba(139,92,246,0.22) 0%, transparent 70%);
    filter: blur(40px);
  }

  /* Purple glow bottom-right */
  .glow-br {
    position: absolute;
    bottom: -100px;
    right: 360px;
    width: 400px;
    height: 400px;
    background: radial-gradient(ellipse, rgba(168,85,247,0.15) 0%, transparent 70%);
    filter: blur(50px);
  }

  .layout {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 72px 0 64px;
    gap: 64px;
  }

  /* LEFT SIDE */
  .left {
    flex: 0 0 440px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(139,92,246,0.12);
    border: 1px solid rgba(139,92,246,0.3);
    border-radius: 100px;
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255,255,255,0.75);
    letter-spacing: 0.04em;
    width: fit-content;
    margin-bottom: 28px;
  }
  .badge-dot {
    width: 7px;
    height: 7px;
    background: #a78bfa;
    border-radius: 50%;
  }

  .wordmark {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 24px;
  }
  .logo-icon {
    width: 52px;
    height: 52px;
    border-radius: 14px;
    background: linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: 800;
    color: white;
    flex-shrink: 0;
  }
  .brand-text {
    font-size: 38px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .brand-text .out { color: rgba(255,255,255,0.95); }
  .brand-text .reign { color: #a78bfa; }
  .brand-text .domain { color: rgba(255,255,255,0.35); font-weight: 400; font-size: 28px; }

  .headline {
    font-size: 42px;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.03em;
    color: rgba(255,255,255,0.96);
    margin-bottom: 14px;
  }
  .headline em {
    font-style: italic;
    color: #a78bfa;
  }

  .sub {
    font-size: 16px;
    line-height: 1.55;
    color: rgba(255,255,255,0.55);
    max-width: 360px;
    margin-bottom: 32px;
  }

  .pills {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .pill {
    background: rgba(139,92,246,0.1);
    border: 1px solid rgba(139,92,246,0.22);
    border-radius: 8px;
    padding: 7px 14px;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255,255,255,0.7);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pill-dot {
    width: 5px;
    height: 5px;
    background: #a78bfa;
    border-radius: 50%;
  }

  /* RIGHT SIDE — dashboard mockup */
  .right {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .mockup {
    width: 590px;
    height: 430px;
    background: rgba(14,8,28,0.9);
    border: 1px solid rgba(139,92,246,0.2);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 0 80px rgba(139,92,246,0.12), 0 32px 64px rgba(0,0,0,0.6);
    position: relative;
  }

  .mockup-header {
    height: 44px;
    background: rgba(139,92,246,0.06);
    border-bottom: 1px solid rgba(139,92,246,0.12);
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 8px;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .dot-r { background: #ef4444; }
  .dot-y { background: #f59e0b; }
  .dot-g { background: #22c55e; }
  .header-brand {
    margin-left: 8px;
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.7);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .header-brand .out { color: rgba(255,255,255,0.85); }
  .header-brand .reign { color: #a78bfa; }
  .header-brand .suffix { color: rgba(255,255,255,0.3); }

  .mockup-body {
    display: flex;
    height: calc(100% - 44px);
  }

  /* Sidebar */
  .sidebar {
    width: 130px;
    background: rgba(139,92,246,0.04);
    border-right: 1px solid rgba(139,92,246,0.1);
    padding: 14px 0;
    flex-shrink: 0;
  }
  .sidebar-item {
    padding: 8px 16px;
    font-size: 11px;
    color: rgba(255,255,255,0.4);
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }
  .sidebar-item.active {
    background: rgba(139,92,246,0.12);
    color: #a78bfa;
    border-right: 2px solid #a78bfa;
  }
  .si-icon {
    width: 14px;
    height: 14px;
    background: currentColor;
    border-radius: 3px;
    opacity: 0.7;
    flex-shrink: 0;
  }

  /* Main content */
  .main-content {
    flex: 1;
    padding: 14px 16px;
    overflow: hidden;
  }

  /* Stats row */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }
  .stat-card {
    background: rgba(139,92,246,0.05);
    border: 1px solid rgba(139,92,246,0.1);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .stat-label { font-size: 9px; color: rgba(255,255,255,0.4); margin-bottom: 3px; }
  .stat-value { font-size: 16px; font-weight: 700; color: white; }
  .stat-value.accent { color: #a78bfa; }
  .stat-change { font-size: 9px; color: #34d399; margin-top: 2px; }

  /* Chart area */
  .charts-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .chart-card {
    background: rgba(139,92,246,0.05);
    border: 1px solid rgba(139,92,246,0.1);
    border-radius: 8px;
    padding: 10px 12px;
    height: 130px;
    overflow: hidden;
  }
  .chart-title { font-size: 9px; font-weight: 600; color: rgba(255,255,255,0.5); margin-bottom: 8px; }

  /* Pipeline chart bars */
  .bar-chart {
    display: flex;
    align-items: flex-end;
    gap: 5px;
    height: 72px;
  }
  .bar {
    flex: 1;
    background: rgba(139,92,246,0.3);
    border-radius: 3px 3px 0 0;
    position: relative;
  }
  .bar.highlight {
    background: linear-gradient(to top, #7c3aed, #a78bfa);
  }

  /* Lead score distribution */
  .dist-chart {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 72px;
  }
  .dist-bar { flex: 1; border-radius: 2px 2px 0 0; }

  /* Sequences list */
  .seq-list { display: flex; flex-direction: column; gap: 5px; }
  .seq-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 9px;
  }
  .seq-name { color: rgba(255,255,255,0.6); flex: 1; white-space: nowrap; overflow: hidden; }
  .seq-bar-wrap { width: 60px; height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; }
  .seq-bar-fill { height: 100%; background: #7c3aed; border-radius: 2px; }
  .seq-pct { color: rgba(255,255,255,0.45); width: 30px; text-align: right; }

  .live-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(139,92,246,0.15);
    border: 1px solid rgba(139,92,246,0.25);
    border-radius: 100px;
    padding: 3px 8px;
    font-size: 9px;
    font-weight: 700;
    color: #a78bfa;
    letter-spacing: 0.06em;
  }
  .live-dot {
    width: 5px;
    height: 5px;
    background: #a78bfa;
    border-radius: 50%;
  }
</style>
</head>
<body>
  <div class="glow-tl"></div>
  <div class="glow-br"></div>

  <div class="layout">
    <!-- LEFT -->
    <div class="left">
      <div class="badge">
        <span class="badge-dot"></span>
        AI SDR NOW LIVE
      </div>

      <div class="wordmark">
        <div class="logo-icon">OR</div>
        <div class="brand-text">
          <span class="out">Out</span><span class="reign">Reign</span><span class="domain">.io</span>
        </div>
      </div>

      <div class="headline">
        Find who to sell to.<br>
        <em>Then actually<br>sell to them.</em>
      </div>

      <div class="sub">
        AI-powered B2B lead discovery, enrichment, and personalized outreach — all from one powerful workflow.
      </div>

      <div class="pills">
        <div class="pill"><span class="pill-dot"></span>AI Lead Scoring</div>
        <div class="pill"><span class="pill-dot"></span>Smart Outreach</div>
        <div class="pill"><span class="pill-dot"></span>Pipeline Analytics</div>
      </div>
    </div>

    <!-- RIGHT: Dashboard mockup -->
    <div class="right">
      <div class="mockup">
        <div class="mockup-header">
          <div class="dot dot-r"></div>
          <div class="dot dot-y"></div>
          <div class="dot dot-g"></div>
          <div class="header-brand">
            <span class="out">Out</span><span class="reign">Reign</span><span class="suffix">.io</span>
          </div>
          <div style="margin-left:auto; display:flex; gap:6px; align-items:center;">
            <div style="width:80px; height:20px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); border-radius:5px;"></div>
            <div style="width:20px; height:20px; background:rgba(139,92,246,0.25); border-radius:50%; display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#a78bfa;">OR</div>
          </div>
        </div>
        <div class="mockup-body">
          <!-- Sidebar -->
          <div class="sidebar">
            <div class="sidebar-item active">
              <div class="si-icon" style="border-radius:50%;"></div>
              Dashboard
            </div>
            <div class="sidebar-item">
              <div class="si-icon"></div>
              Leads
            </div>
            <div class="sidebar-item">
              <div class="si-icon"></div>
              Outreach
            </div>
            <div class="sidebar-item">
              <div class="si-icon"></div>
              Sequences
            </div>
            <div class="sidebar-item">
              <div class="si-icon"></div>
              Analytics
            </div>
            <div class="sidebar-item">
              <div class="si-icon"></div>
              Workflows
            </div>
          </div>

          <!-- Main -->
          <div class="main-content">
            <!-- Stats -->
            <div class="stats-row">
              <div class="stat-card">
                <div class="stat-label">Leads Discovered</div>
                <div class="stat-value">12,846</div>
                <div class="stat-change">↑ 24%</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Emails Sent</div>
                <div class="stat-value">8,673</div>
                <div class="stat-change">↑ 18%</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Reply Rate</div>
                <div class="stat-value">23.7%</div>
                <div class="stat-change">↑ 31%</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">Pipeline</div>
                <div class="stat-value accent">$2.45M</div>
                <div class="stat-change">↑ 27%</div>
              </div>
            </div>

            <!-- Charts -->
            <div class="charts-row">
              <div class="chart-card">
                <div class="chart-title">Pipeline Progress</div>
                <div class="bar-chart">
                  <div class="bar" style="height:28%;"></div>
                  <div class="bar" style="height:35%;"></div>
                  <div class="bar" style="height:42%;"></div>
                  <div class="bar" style="height:55%;"></div>
                  <div class="bar" style="height:68%;"></div>
                  <div class="bar highlight" style="height:100%;"></div>
                </div>
                <div style="font-size:8px;color:rgba(255,255,255,0.3);margin-top:4px;display:flex;gap:8px;">
                  <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
                </div>
              </div>

              <div class="chart-card">
                <div class="chart-title">Top Sequences</div>
                <div class="seq-list">
                  <div class="seq-item">
                    <span class="seq-name">Q2 Enterprise Push</span>
                    <div class="seq-bar-wrap"><div class="seq-bar-fill" style="width:65%"></div></div>
                    <span class="seq-pct">24.7%</span>
                  </div>
                  <div class="seq-item">
                    <span class="seq-name">Cold Outreach v2</span>
                    <div class="seq-bar-wrap"><div class="seq-bar-fill" style="width:48%"></div></div>
                    <span class="seq-pct">18.3%</span>
                  </div>
                  <div class="seq-item">
                    <span class="seq-name">AI Follow-up Flow</span>
                    <div class="seq-bar-wrap"><div class="seq-bar-fill" style="width:85%"></div></div>
                    <span class="seq-pct">32.1%</span>
                  </div>
                  <div class="seq-item">
                    <span class="seq-name">Inbound Nurture</span>
                    <div class="seq-bar-wrap"><div class="seq-bar-fill" style="width:72%"></div></div>
                    <span class="seq-pct">27.6%</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Bottom row -->
            <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
              <div class="live-badge">
                <span class="live-dot"></span>
                AI SDR LIVE
              </div>
              <span style="font-size:9px;color:rgba(255,255,255,0.3);">Working 24/7 to find and engage your next best leads</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

const browser = await puppeteer.launch({
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  headless: true,
});

const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle0' });

const screenshot = await page.screenshot({ type: 'png' });
const outPath = join(__dirname, '../public/outreign-og.png');
writeFileSync(outPath, screenshot);

await browser.close();
console.log('Written to', outPath);
