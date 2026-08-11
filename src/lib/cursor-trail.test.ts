import { describe, expect, it } from "vitest";
import {
  cursorForPage,
  hasNextPage,
  recordCursor,
  resetTrail,
} from "./cursor-trail";

describe("cursor trail", () => {
  it("starts with no cursor for page one", () => {
    const trail = resetTrail();

    expect(cursorForPage(trail, 1)).toBeUndefined();
  });

  it("stores a response's cursor against the page it fetches next", () => {
    // Loading page 1 returns the cursor for page 2, not for page 1.
    const trail = recordCursor(resetTrail(), 1, "cursor-for-page-2");

    expect(cursorForPage(trail, 1)).toBeUndefined();
    expect(cursorForPage(trail, 2)).toBe("cursor-for-page-2");
  });

  it("walks forward across several pages", () => {
    let trail = resetTrail();
    trail = recordCursor(trail, 1, "c2");
    trail = recordCursor(trail, 2, "c3");
    trail = recordCursor(trail, 3, "c4");

    expect(cursorForPage(trail, 2)).toBe("c2");
    expect(cursorForPage(trail, 3)).toBe("c3");
    expect(cursorForPage(trail, 4)).toBe("c4");
  });

  it("remembers earlier cursors so paging can go back", () => {
    // A cursor only points forward, so returning to page 2 has to reuse the one
    // that fetched it rather than deriving it from where we are now.
    let trail = resetTrail();
    trail = recordCursor(trail, 1, "c2");
    trail = recordCursor(trail, 2, "c3");

    expect(cursorForPage(trail, 2)).toBe("c2");
    expect(cursorForPage(trail, 1)).toBeUndefined();
  });

  it("treats the end of results as having no cursor", () => {
    const trail = recordCursor(resetTrail(), 1, null);

    expect(cursorForPage(trail, 2)).toBeUndefined();
  });

  it("does not leave a gap that reads as a usable cursor", () => {
    // Recording out of order must not let an untouched slot resolve to
    // something stale from a previous search.
    const trail = recordCursor(resetTrail(), 3, "c4");

    expect(cursorForPage(trail, 2)).toBeUndefined();
    expect(cursorForPage(trail, 3)).toBeUndefined();
    expect(cursorForPage(trail, 4)).toBe("c4");
  });

  it("ignores a nonsense page rather than corrupting the trail", () => {
    const trail = resetTrail();

    expect(recordCursor(trail, 0, "x")).toEqual(trail);
    expect(recordCursor(trail, -2, "x")).toEqual(trail);
  });

  it("does not mutate the trail it was given", () => {
    const trail = resetTrail();
    recordCursor(trail, 1, "c2");

    expect(trail).toEqual([null]);
  });
});

describe("hasNextPage", () => {
  it("follows the cursor when the provider offers one", () => {
    // The row total is an estimate. A cursor past the last estimated page still
    // means there is more, which is the case offset paging could never reach.
    expect(hasNextPage("c2", 5, 5)).toBe(true);
  });

  it("falls back to the page count when there is no cursor", () => {
    expect(hasNextPage(null, 1, 3)).toBe(true);
    expect(hasNextPage(null, 3, 3)).toBe(false);
  });

  it("stops at the end of a single-page result", () => {
    expect(hasNextPage(null, 1, 1)).toBe(false);
  });
});
