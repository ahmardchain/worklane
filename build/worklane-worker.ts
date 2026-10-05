import handler from "./sites-worker";
import { standaloneRequest } from "../lib/standalone-request";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

export default {
  fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>,
  ) {
    return handler.fetch(
      import.meta.env.DEV ? request : standaloneRequest(request),
      env,
      ctx,
    );
  },
};
