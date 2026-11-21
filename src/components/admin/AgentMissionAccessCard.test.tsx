// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const read = vi.hoisted(() => vi.fn(async () => ({ data: null, error: { code: "PGRST205" } })));
const write = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({
    select: () => ({ order: read }),
    upsert: write,
    update: write,
  }) },
}));

import { AgentMissionAccessCard } from "./AgentMissionAccessCard";

describe("unavailable Agent Missions setup", () => {
  it("does not permit access grants or claim there are no grants when the table is missing", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<AgentMissionAccessCard />));
      const input = container.querySelector("input");
      const grant = container.querySelector("button");
      expect(input?.disabled).toBe(true);
      expect(grant?.disabled).toBe(true);
      await act(async () => grant?.click());
      expect(write).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain("No workspace has been granted.");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});