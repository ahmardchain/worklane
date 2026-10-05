import { agentGuide } from "../../lib/agent-guide";

export function GET(request: Request) {
  return new Response(agentGuide(new URL(request.url).origin), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
