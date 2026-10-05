import { env } from "cloudflare:workers";
import { handle, type Services } from "../../../lib/service";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return handle(request, env as Services);
}
export function POST(request: Request) {
  return handle(request, env as Services);
}
