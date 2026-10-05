export function GET(request: Request) {
  return Response.redirect(new URL("/agents.md", request.url), 308);
}
