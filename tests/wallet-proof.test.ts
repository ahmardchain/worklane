import { test } from "node:test";
import assert from "node:assert/strict";
import { hashMessage, serializeErc6492Signature } from "viem";
import { verifyWalletProof } from "../lib/wallet-proof.ts";
import { workerAccount, recipient, payer } from "./helpers.ts";

const message = "Worklane ownership proof bound to Arc and a one-use nonce";
const contractWallet = `0x${"34".repeat(20)}`;
const signature = `0x${"ab".repeat(160)}` as const;
const proof = {
  wallet: contractWallet,
  wallet_provider: "circle" as const,
  wallet_chain_id: 5042,
  message,
};

test("Circle proof uses the bound Arc chain and an onchain signature check", async () => {
  const requests: { method: string; params: unknown[] }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    assert.equal(url, "https://rpc.mainnet.arc.io");
    const body = JSON.parse(init.body as string);
    requests.push(body);
    if (body.method === "eth_chainId")
      return Response.json({ result: "0x13b2" });
    assert.equal(body.method, "eth_call");
    const input = body.params[0].data.toLowerCase();
    assert.ok(input.includes(contractWallet.slice(2)));
    assert.ok(input.includes(hashMessage(message).slice(2)));
    assert.ok(input.includes(signature.slice(2)));
    return Response.json({ result: "0x01" });
  }) as typeof fetch;
  assert.equal(await verifyWalletProof(proof, signature, fetcher), true);
  assert.deepEqual(
    requests.map((r) => r.method),
    ["eth_chainId", "eth_call"],
  );
});

test("Circle proof rejects wrong chain, RPC failure and a rejected signature", async () => {
  const response = (chain: string, result: string) =>
    (async (_url: unknown, init: RequestInit) => {
      const { method } = JSON.parse(init.body as string);
      return Response.json({
        result: method === "eth_chainId" ? chain : result,
      });
    }) as typeof fetch;
  await assert.rejects(
    verifyWalletProof(proof, signature, response("0x1", "0x01")),
    /chain/,
  );
  await assert.rejects(
    verifyWalletProof(
      proof,
      signature,
      (async () => new Response("offline", { status: 503 })) as typeof fetch,
    ),
    /unavailable/,
  );
  assert.equal(
    await verifyWalletProof(proof, signature, response("0x13b2", "0x00")),
    false,
  );
});

test("pre-deployed ERC-6492 signatures are verified through the read-only validator", async () => {
  const wrapped = serializeErc6492Signature({
    address: payer as `0x${string}`,
    data: "0x1234",
    signature,
  });
  let called = false;
  const fetcher = (async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    if (body.method === "eth_chainId")
      return Response.json({ result: "0x13b2" });
    assert.equal(body.method, "eth_call");
    assert.ok(body.params[0].data.includes(wrapped.slice(2)));
    called = true;
    return Response.json({ result: "0x01" });
  }) as typeof fetch;
  assert.equal(await verifyWalletProof(proof, wrapped, fetcher), true);
  assert.equal(called, true);
});

test("external wallets keep EOA ownership proof and cannot skip it", async () => {
  const external = {
    ...proof,
    wallet: recipient,
    wallet_provider: "external" as const,
  };
  const noRpc = (async () => {
    throw new Error("EOA proof must not call RPC");
  }) as typeof fetch;
  const signed = await workerAccount.signMessage({ message });
  assert.equal(await verifyWalletProof(external, signed, noRpc), true);
  assert.equal(
    await verifyWalletProof({ ...external, message: "changed" }, signed, noRpc),
    false,
  );
});
