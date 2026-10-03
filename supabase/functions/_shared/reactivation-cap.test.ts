import { assertEquals } from "jsr:@std/assert";
import { capDecision } from "./reactivation-cap.ts";
const now = new Date("2026-10-03T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
Deno.test("no email sent before -> allowed", () => assertEquals(capDecision([], now).allowed, true));
Deno.test("email 10 days ago -> blocked (14 day gap)", () => assertEquals(capDecision([daysAgo(10)], now).allowed, false));
Deno.test("email 15 days ago -> allowed", () => assertEquals(capDecision([daysAgo(15)], now).allowed, true));
Deno.test("3 emails ever -> blocked forever", () => assertEquals(capDecision([daysAgo(40), daysAgo(80), daysAgo(120)], now).allowed, false));
