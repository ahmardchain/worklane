import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cents,
  micros,
  checkReceipt,
  verifyPayout,
  NETWORKS,
} from "../lib/arc.ts";
import { hash, payer, recipient, proofFixture, rpcFixture } from "./helpers.ts";

const payout = {
  chain_id: 5042,
  sender: payer,
  recipient,
  amount_micros: "25000000",
  min_block: "101",
};
test("Arc rewards retain exact cents and six-decimal token amounts", () => {
  assert.equal(cents("25.00"), 2500);
  assert.equal(micros(cents("0.01")), 10000n);
  assert.equal(micros(cents("99.99")), 99990000n);
  for (const amount of ["0", "-1", "1.001", "101.00", "1e2", "NaN"])
    assert.throws(() => cents(amount));
  assert.equal(NETWORKS[5042].testnet, false);
  assert.equal(NETWORKS[5042002].testnet, true);
});
test("only the exact approved ERC20 transfer settles a job", () => {
  const { receipt, transaction } = proofFixture();
  assert.equal(checkReceipt(payout, hash, receipt, transaction, 102n), true);
  assert.equal(checkReceipt(payout, hash, null, transaction, 102n), false);
  assert.equal(checkReceipt(payout, hash, receipt, transaction, 101n), false);
  assert.throws(
    () =>
      checkReceipt(
        payout,
        hash,
        { ...receipt, status: "0x0" },
        transaction,
        102n,
      ),
    /failed/,
  );
  assert.throws(
    () =>
      checkReceipt(
        payout,
        hash,
        { ...receipt, blockNumber: "0x64" },
        transaction,
        102n,
      ),
    /predates/,
  );
  assert.throws(
    () =>
      checkReceipt(
        payout,
        hash,
        receipt,
        { ...transaction, from: recipient },
        102n,
      ),
    /saved payer/,
  );
  assert.throws(
    () =>
      checkReceipt(
        payout,
        hash,
        receipt,
        { ...transaction, to: recipient },
        102n,
      ),
    /USDC/,
  );
  assert.throws(
    () =>
      checkReceipt(
        payout,
        hash,
        receipt,
        { ...transaction, input: "0x" },
        102n,
      ),
    /calldata/,
  );
  assert.throws(
    () =>
      checkReceipt(
        { ...payout, amount_micros: "25000000000000000000" },
        hash,
        receipt,
        transaction,
        102n,
      ),
    /calldata/,
  );
  assert.throws(
    () =>
      checkReceipt(
        payout,
        hash,
        { ...receipt, logs: [...receipt.logs, ...receipt.logs] },
        transaction,
        102n,
      ),
    /exactly one/,
  );
  assert.throws(
    () =>
      checkReceipt(payout, hash, { ...receipt, logs: [] }, transaction, 102n),
    /exactly one/,
  );
});
test("RPC network is checked before proof retrieval", async () => {
  await assert.rejects(
    verifyPayout(payout, hash, rpcFixture({ chain: 5042002 })),
    /chain does not match/,
  );
  assert.equal(
    await verifyPayout(payout, hash, rpcFixture({ block: "0x66" })),
    true,
  );
  assert.equal(
    await verifyPayout(payout, hash, rpcFixture({ receipt: null })),
    false,
  );
});
