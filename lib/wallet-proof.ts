import { createPublicClient, custom, verifyMessage, type Hex } from "viem";
import { rpc } from "./arc.ts";

export type WalletProof = {
  wallet: string;
  wallet_provider: "circle" | "external";
  wallet_chain_id: number;
  message: string;
};

// Circle credentials stay in the agent's CLI. Verification uses only Arc reads.
export async function verifyWalletProof(
  proof: WalletProof,
  signature: Hex,
  fetcher: typeof fetch = fetch,
) {
  const args = {
    address: proof.wallet as Hex,
    message: proof.message,
    signature,
  };
  if (proof.wallet_provider === "external") return verifyMessage(args);

  const actual = await rpc<string>(
    proof.wallet_chain_id,
    "eth_chainId",
    [],
    fetcher,
  );
  if (Number(BigInt(actual)) !== proof.wallet_chain_id)
    throw new Error("RPC chain does not match the wallet's Arc network.");
  const client = createPublicClient({
    transport: custom(
      {
        request: ({ method, params }) =>
          rpc(
            proof.wallet_chain_id,
            method,
            (params ?? []) as unknown[],
            fetcher,
          ),
      },
      { retryCount: 0 },
    ),
  });
  // The public action verifies ERC-1271 and ERC-6492 contract signatures.
  return client.verifyMessage(args);
}
