import { env } from "cloudflare:workers";
import { handle, type Services } from "../../../lib/service";
import { handlePublisher } from "../../../lib/publisher-auth";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return new URL(request.url).pathname.startsWith("/v1/publisher/")
    ? handlePublisher(request, env as Services)
    : handle(request, env as Services);
}
export function POST(request: Request) {
  return new URL(request.url).pathname.startsWith("/v1/publisher/")
    ? handlePublisher(request, env as Services)
    : handle(request, env as Services);
}
