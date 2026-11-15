import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { VISITOR_SDK_SOURCE } from "../_shared/visitor-sdk.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=300",
};

serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers });
  }
  return new Response(req.method === "HEAD" ? null : VISITOR_SDK_SOURCE, { headers });
});
