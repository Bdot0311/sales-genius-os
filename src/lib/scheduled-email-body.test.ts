// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { savedScheduledEmailBody, scheduledEmailEditorHtml } from "./scheduled-email-body";

const html = '<p>Hello Taylor, see our <a href="https://example.com/demo">demo</a>.</p><div>Best,<br>Alex<br><a href="https://example.com">My company</a><br><img src="https://example.com/logo.png" width="320"></div>';
const email = { body_html: html, body_text: "Hello Taylor, see our demo.\nBest,\nAlex\nMy company" };

describe("editing scheduled email bodies", () => {
  it("leaves the original body unchanged when only the subject or time changes", () => {
    expect(savedScheduledEmailBody(email, null)).toEqual(email);
  });

  it("keeps the signature logo and both link destinations when a typo is corrected", () => {
    const editor = document.createElement("div");
    editor.innerHTML = scheduledEmailEditorHtml(email);
    const greeting = editor.querySelector("p")?.firstChild;
    if (!greeting) throw new Error("Missing greeting");
    greeting.textContent = "Hi Taylor, see our ";
    const saved = savedScheduledEmailBody(email, editor.innerHTML);
    const result = document.createElement("div");
    result.innerHTML = saved.body_html ?? "";
    expect(result.querySelector("img")?.getAttribute("src")).toBe("https://example.com/logo.png");
    expect(Array.from(result.querySelectorAll("a"), (link) => link.getAttribute("href"))).toEqual(["https://example.com/demo", "https://example.com"]);
    expect(saved.body_text).toBe("Hi Taylor, see our demo.\nBest,\nAlex\nMy company");
  });

  it("uses the HTML alternative even when a legacy text column contains markup", () => {
    expect(scheduledEmailEditorHtml({ ...email, body_text: html })).toBe(scheduledEmailEditorHtml(email));
  });

  it("keeps text-only messages as text, including literal angle brackets", () => {
    const legacy = { body_html: null, body_text: "Hello\n\nBudget < 500 & > 100" };
    const saved = savedScheduledEmailBody(legacy, scheduledEmailEditorHtml(legacy));
    expect(saved.body_text).toBe(legacy.body_text);
  });

  it("removes unsafe markup without removing signature images or safe links", () => {
    const saved = savedScheduledEmailBody(email, html + '<img src="x" onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">Bad</a>');
    const result = document.createElement("div");
    result.innerHTML = saved.body_html ?? "";
    expect(result.querySelector("script, [onerror], [href^='javascript:']")).toBeNull();
    expect(result.querySelector('img[src="https://example.com/logo.png"]')).not.toBeNull();
  });
});