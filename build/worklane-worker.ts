import handler from "./sites-worker";
import { authenticatedStandaloneRequest } from "../lib/standalone-request";
import type { Services } from "../lib/service";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

export default {
  async fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>,
  ) {
    return handler.fetch(
      await authenticatedStandaloneRequest(request, env as Services),
      env,
      ctx,
    );
  },
};
