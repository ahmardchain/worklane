import { encodeFunctionData, parseAbi, decodeEventLog } from "viem";

export const USDC = "0x3600000000000000000000000000000000000000" as const;
export const USDC_ABI = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
export const NETWORKS = {
  5042: {
    id: 5042,
    name: "Arc Mainnet",
    rpc: "https://rpc.mainnet.arc.io",
    explorer: "https://explorer.arc.io",
    testnet: false,
  },
  5042002: {
    id: 5042002,
    name: "Arc Testnet",
    rpc: "https://rpc.testnet.arc.io",
    explorer: "https://explorer.testnet.arc.io",
    testnet: true,
  },
};
export type ChainId = keyof typeof NETWORKS;
export function network(id: number) {
  if (!(id in NETWORKS)) throw new Error("Choose Arc Mainnet or Arc Testnet.");
  return NETWORKS[id as ChainId];
}
export function cents(value: string): number {
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a USDC reward with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (result < 1 || result > 10000)
    throw new Error("Rewards must be between 0.01 and 100.00 USDC.");
  return result;
}
export const micros = (amountCents: number) => BigInt(amountCents) * 10000n;
export const money = (value: number) =>
  (value / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function transferData(to: `0x${string}`, amount: string) {
  return encodeFunctionData({
    abi: USDC_ABI,
    functionName: "transfer",
    args: [to, BigInt(amount)],
  });
}
export async function rpc<T = unknown>(
  chainId: number,
  method: string,
  params: unknown[] = [],
  fetcher: typeof fetch = fetch,
) {
  const res = await fetcher(network(chainId).rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("Arc RPC is unavailable. Please try again.");
  const data = (await res.json()) as {
    result: T;
    error?: { message: string };
  };
  if (data.error) throw new Error("Arc RPC could not verify this request.");
  return data.result;
}
export async function chainBlock(
  chainId: number,
  fetcher: typeof fetch = fetch,
) {
  const actual = await rpc<string>(chainId, "eth_chainId", [], fetcher);
  if (Number(BigInt(actual)) !== chainId)
    throw new Error("RPC chain does not match the selected Arc network.");
  return BigInt(await rpc<string>(chainId, "eth_blockNumber", [], fetcher));
}
export type PayoutProof = {
  chain_id: number;
  sender: string;
  recipient: string;
  amount_micros: string;
  min_block: string;
};
export type RpcLog = {
  address: string;
  data: `0x${string}`;
  topics: [`0x${string}`, ...`0x${string}`[]];
};
export type RpcReceipt = {
  status: string;
  transactionHash: string;
  blockNumber: string;
  logs: RpcLog[];
};
export type RpcTransaction = {
  hash: string;
  from: string;
  to: string | null;
  input: string;
};
export function checkReceipt(
  payout: PayoutProof,
  hash: string,
  receipt: RpcReceipt | null,
  transaction: RpcTransaction | null,
  head: bigint,
) {
  if (!receipt || !transaction) return false;
  if (receipt.status !== "0x1")
    throw new Error("This transaction failed onchain.");
  if (
    receipt.transactionHash?.toLowerCase() !== hash.toLowerCase() ||
    transaction.hash?.toLowerCase() !== hash.toLowerCase()
  )
    throw new Error("Transaction hash mismatch.");
  if (BigInt(receipt.blockNumber) < BigInt(payout.min_block))
    throw new Error("This transfer predates approval.");
  if (head < BigInt(receipt.blockNumber)) return false;
  if (
    transaction.from?.toLowerCase() !== payout.sender ||
    transaction.to?.toLowerCase() !== USDC
  )
    throw new Error(
      "The transfer must come from the saved payer and call Arc's USDC interface.",
    );
  if (
    transaction.input?.toLowerCase() !==
    transferData(
      payout.recipient as `0x${string}`,
      payout.amount_micros,
    ).toLowerCase()
  )
    throw new Error(
      "Payment calldata does not match the approved recipient and reward.",
    );
  const transfers = (receipt.logs ?? [])
    .filter((l) => l.address?.toLowerCase() === USDC)
    .flatMap((l) => {
      try {
        return [
          decodeEventLog({ abi: USDC_ABI, data: l.data, topics: l.topics }),
        ];
      } catch {
        return [];
      }
    });
  if (transfers.length !== 1)
    throw new Error("Expected exactly one USDC transfer event.");
  const args = transfers[0].args;
  if (
    args.from.toLowerCase() !== payout.sender ||
    args.to.toLowerCase() !== payout.recipient ||
    args.value !== BigInt(payout.amount_micros)
  )
    throw new Error("USDC transfer event does not match the approved payment.");
  return true;
}
export async function verifyPayout(
  payout: PayoutProof,
  hash: string,
  fetcher: typeof fetch = fetch,
) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
    throw new Error("Enter a valid transaction hash.");
  const head = await chainBlock(payout.chain_id, fetcher);
  const [receipt, transaction] = await Promise.all([
    rpc<RpcReceipt | null>(
      payout.chain_id,
      "eth_getTransactionReceipt",
      [hash],
      fetcher,
    ),
    rpc<RpcTransaction | null>(
      payout.chain_id,
      "eth_getTransactionByHash",
      [hash],
      fetcher,
    ),
  ]);
  return checkReceipt(payout, hash, receipt, transaction, head);
}
