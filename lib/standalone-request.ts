// Sites identity headers are trusted only behind the Sites gateway. The public
// standalone Worker has no such gateway, so caller-supplied identity fails closed.
export function standaloneRequest(request: Request): Request {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith("oai-authenticated-user-")) headers.delete(name);
  }
  return new Request(request, { headers });
}
