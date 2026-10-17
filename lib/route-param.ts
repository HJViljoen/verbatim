/**
 * A dynamic route segment as the page reads it: decoded once where it still
 * carries a percent escape (a slug or an id written by `encodeURIComponent`),
 * and as it came where it does not decode. Pure.
 */
export function routeParam(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
