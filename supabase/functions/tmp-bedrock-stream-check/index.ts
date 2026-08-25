// Temporary diagnostic: verifies Bedrock ConverseStream SSE translation.
import { bedrockChatStream, bedrockDefaultModel } from "../_shared/bedrock.ts";

Deno.serve(async () => {
  const start = Date.now();
  const res = await bedrockChatStream(bedrockDefaultModel(), {
    stream: true,
    messages: [{ role: "user", content: "Count from 1 to 30, one number per line." }],
  });
  if (!res.ok || !res.body) {
    return new Response(JSON.stringify({ ok: false, status: res.status, body: await res.text() }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const timings: number[] = [];
  let text = "";
  let chunks = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks++;
    timings.push(Date.now() - start);
    const s = dec.decode(value);
    for (const line of s.split("\n")) {
      if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
      try {
        const j = JSON.parse(line.slice(6));
        const c = j?.choices?.[0]?.delta?.content;
        if (typeof c === "string") text += c;
      } catch { /* ignore */ }
    }
  }
  return new Response(
    JSON.stringify({ ok: true, chunks, firstChunkMs: timings[0], lastChunkMs: timings.at(-1), textLen: text.length, sample: text.slice(0, 60) }),
    { headers: { "Content-Type": "application/json" } },
  );
});
