import { describe, expect, it } from "vitest";
import { allowedToolsFor } from "../../supabase/functions/_shared/agent-tool-scope.ts";

// Every agent — preset role or custom build — must hold the tools its job needs.
describe("role tool scoping", () => {
  it("gives a replies agent the ability to write and send the reply", () => {
    const tools = allowedToolsFor({ role: "replies" });
    for (const t of ["list_recent_replies", "draft_outreach", "list_drafts", "send_outreach", "list_mailboxes"]) {
      expect(tools).toContain(t);
    }
    expect(tools).not.toContain("find_leads");
  });

  it("gives an outreach agent research and scoring for personalisation", () => {
    const tools = allowedToolsFor({ role: "outreach" });
    expect(tools).toContain("research_leads");
    expect(tools).toContain("score_leads");
    expect(tools).toContain("draft_outreach");
    expect(tools).not.toContain("find_leads");
  });

  it("keeps a lead gen agent out of email work", () => {
    const tools = allowedToolsFor({ role: "lead_gen" });
    expect(tools).toContain("find_leads");
    expect(tools).toContain("enrich_leads");
    expect(tools).not.toContain("send_drafts");
    expect(tools).not.toContain("draft_outreach");
  });

  it("closes every role over tool prerequisites", () => {
    for (const role of ["lead_gen", "outreach", "replies", "full_cycle"]) {
      const tools = allowedToolsFor({ role });
      if (tools.includes("send_drafts")) {
        expect(tools).toContain("list_drafts");
        expect(tools).toContain("list_mailboxes");
      }
      if (tools.includes("resolve_approvals")) expect(tools).toContain("list_pending_approvals");
    }
  });

  it("lets an operator narrow a preset role but never widen it", () => {
    const narrowed = allowedToolsFor({
      role: "lead_gen",
      allowed_tools: ["enrich_leads", "send_drafts"],
    });
    expect(narrowed).toContain("enrich_leads");
    expect(narrowed).not.toContain("send_drafts");
    expect(narrowed).not.toContain("find_leads");
  });

  it("keeps a custom build to exactly what it was granted", () => {
    const tools = allowedToolsFor({ role: "custom", allowed_tools: ["list_recent_replies"] });
    expect(tools).toContain("list_recent_replies");
    expect(tools).not.toContain("send_drafts");
  });
});

describe("CRM tooling for custom builds", () => {
  it("lets a custom CRM build fix leads and manage deals", () => {
    const tools = allowedToolsFor({ role: "custom", allowed_tools: ["find_lead_issues", "update_lead", "update_deal", "create_deal"] });
    for (const t of ["find_lead_issues", "update_lead", "get_lead", "list_deals", "update_deal", "create_deal"]) expect(tools).toContain(t);
    expect(tools).not.toContain("send_drafts");
  });
  it("gives full cycle agents the CRM tools", () => {
    expect(allowedToolsFor({ role: "full_cycle" })).toContain("update_deal");
  });
});
