import { privateError } from "./request";

/** Reads a request stream without allowing a missing length to bypass its cap. */
export async function boundedText(
  request: Request,
  maximumBytes: number,
): Promise<string | Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > maximumBytes
  ) {
    return privateError("invalid_request", 413);
  }

  const reader = request.body?.getReader();
  if (!reader) return privateError("invalid_request", 400);
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel();
        return privateError("invalid_request", 413);
      }
      chunks.push(value);
    }
    if (received === 0) return privateError("invalid_request", 400);
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return privateError("invalid_request", 400);
  }
}

/** Reads one exact-size JSON request without reflecting parser details. */
export async function boundedJson(
  request: Request,
  maximumBytes: number,
): Promise<unknown | Response> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    return privateError("invalid_request", 400);
  }
  try {
    const text = await boundedText(request, maximumBytes);
    if (text instanceof Response) return text;
    return JSON.parse(text) as unknown;
  } catch {
    return privateError("invalid_request", 400);
  }
}
