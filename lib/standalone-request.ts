// Sites identity headers are trusted only behind the Sites gateway. The public
// standalone Worker has no such gateway, so caller-supplied identity fails closed.
export function standaloneRequest(request: Request): Request {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith("oai-authenticated-user-")) headers.delete(name);
  }
  return new Request(request, { headers });
}

export async function authenticatedStandaloneRequest(
  request: Request,
  services: Services,
): Promise<Request> {
  const clean = standaloneRequest(request);
  if (!new URL(clean.url).pathname.startsWith("/v1/")) return clean;
  const identity = await publisherIdentity(clean, services);
  if (!identity) return clean;
  const headers = new Headers(clean.headers);
  headers.set("oai-authenticated-user-id", identity);
  return new Request(clean, { headers });
}
import { publisherIdentity } from "./publisher-auth.ts";
import type { Services } from "./service.ts";
