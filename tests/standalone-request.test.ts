import { test } from "node:test";
import assert from "node:assert/strict";
import { standaloneRequest } from "../lib/standalone-request.ts";

test("standalone requests remove forged publisher identity and preserve agent authentication", async () => {
  const original = new Request("https://worklane.example/v1/jobs", {
    method: "POST",
    headers: {
      "OAI-Authenticated-User-Id": "forged-owner",
      "oai-authenticated-user-email": "owner@example.com",
      "oai-authenticated-user-full-name": "Forged Owner",
      authorization: "Bearer wl_test_agent_key",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      issueUrl: "https://github.com/example/repo/issues/1",
    }),
  });
  const request = standaloneRequest(original);
  assert.equal(request.headers.get("oai-authenticated-user-id"), null);
  assert.equal(request.headers.get("oai-authenticated-user-email"), null);
  assert.equal(request.headers.get("oai-authenticated-user-full-name"), null);
  assert.equal(
    request.headers.get("authorization"),
    "Bearer wl_test_agent_key",
  );
  assert.equal(request.method, "POST");
  assert.equal(request.url, original.url);
  assert.deepEqual(await request.json(), {
    issueUrl: "https://github.com/example/repo/issues/1",
  });
});
