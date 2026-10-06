// Compatibility for bookmarks and previously cached links from the Sites build.
export function GET(request: Request) {
  return Response.redirect(new URL("/", request.url), 303);
}
