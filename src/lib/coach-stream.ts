/**
 * The body the coach pages know how to read.
 *
 * ai-coach returns one Server-Sent Events chunk after it has checked the
 * advice, not a JSON object. A partial chunk has to be put back and parsed
 * on the next read, which is what the pages were doing inline.
 */
export async function readCoachDeltaStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (full: string) => void = () => {},
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "" || !line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (content) {
          full += content;
          onDelta(full);
        }
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }
  return full;
}
