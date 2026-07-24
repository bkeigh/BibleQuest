import { privateError } from "./request";

/** Reads one exact-size JSON request without reflecting parser details. */
export async function boundedJson(
  request: Request,
  maximumBytes: number,
): Promise<unknown | Response> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !Number.isFinite(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > maximumBytes
  ) {
    return privateError("invalid_request", 413);
  }
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)) {
    return privateError("invalid_request", 400);
  }
  try {
    const text = await request.text();
    if (
      text.length === 0 ||
      new TextEncoder().encode(text).byteLength > maximumBytes
    ) {
      return privateError("invalid_request", 413);
    }
    return JSON.parse(text) as unknown;
  } catch {
    return privateError("invalid_request", 400);
  }
}
