"use client";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Copy, Loader2, Wallet } from "lucide-react";

type LoginChallenge = {
  challengeId: string;
  message: string;
  expiresAt: number;
  wallet: string;
  needsGithubProof: boolean;
};
type Props = {
  github: string;
  configured: boolean;
  chainId: number;
  busy: boolean;
  wallet: string | null;
  connect: () => Promise<string>;
  chooseWallet: () => void;
  sign: (message: string, wallet: string) => Promise<string>;
  request: <T>(path: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  copy: (value: string) => Promise<void>;
  onAuthenticated: () => Promise<void>;
};
export default function PublisherLogin(props: Props) {
  const [challenge, setChallenge] = useState<LoginChallenge | null>(null);
  const signature = useRef("");
  async function start() {
    const wallet = await props.connect();
    const next = await props.request<LoginChallenge>("/publisher/challenge", {
      wallet,
      chainId: props.chainId,
    });
    const signed = await props.sign(next.message, next.wallet);
    if (next.needsGithubProof) {
      signature.current = signed;
      setChallenge(next);
    } else {
      await props.request("/publisher/verify", {
        challengeId: next.challengeId,
        signature: signed,
      });
      await props.onAuthenticated();
    }
  }
  function finish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const gistUrl = new FormData(event.currentTarget).get("gistUrl");
    props.run(async () => {
      if (!challenge || !signature.current)
        throw new Error("Start publisher sign-in again.");
      await props.request("/publisher/verify", {
        challengeId: challenge.challengeId,
        signature: signature.current,
        gistUrl,
      });
      signature.current = "";
      await props.onAuthenticated();
    });
  }
  return challenge ? (
    <>
      <p className="modal-copy">
        One-time account check: publish this message in a public gist from{" "}
        <strong>{props.github}</strong>. Worklane will verify that you own the
        GitHub account and the treasury wallet.
      </p>
      <label className="field">
        GitHub verification message
        <textarea readOnly rows={7} value={challenge.message} />
      </label>
      <div className="inline-actions">
        <button
          className="button outline"
          disabled={props.busy}
          onClick={() => props.copy(challenge.message)}
        >
          <Copy size={16} /> Copy message
        </button>
        <a
          className="button outline"
          href="https://gist.github.com/"
          target="_blank"
          rel="noreferrer"
        >
          Open GitHub Gist <ArrowRight size={16} />
        </a>
      </div>
      <p className="form-note">
        Create a public gist named worklane-publisher.txt with the copied
        message. Then paste its link below. Verification expires at{" "}
        {new Date(challenge.expiresAt).toLocaleTimeString()}. Your wallet
        signature stays in this browser.
      </p>
      <form onSubmit={finish}>
        <label className="field">
          Public verification gist URL
          <input
            name="gistUrl"
            type="url"
            required
            maxLength={250}
            placeholder={`https://gist.github.com/${props.github}/…`}
            disabled={props.busy}
          />
        </label>
        <button className="button full" disabled={props.busy}>
          {props.busy ? (
            <Loader2 className="spin" size={17} />
          ) : (
            <ArrowRight size={17} />
          )}{" "}
          Verify and open job form
        </button>
      </form>
      <button
        className="button outline full"
        disabled={props.busy}
        onClick={() => {
          signature.current = "";
          setChallenge(null);
        }}
      >
        Start again
      </button>
    </>
  ) : (
    <>
      <p className="modal-copy">
        Sign in with the publisher wallet you’ll use to pay accepted jobs.{" "}
        {props.configured ? (
          "Use your verified treasury wallet."
        ) : (
          <>
            First setup also verifies your <strong>{props.github}</strong>{" "}
            GitHub account once.
          </>
        )}
      </p>
      <button
        className="button outline full"
        disabled={props.busy}
        onClick={props.chooseWallet}
      >
        <Wallet size={16} />
        {props.wallet
          ? `Publisher wallet: ${props.wallet.slice(0, 6)}…${props.wallet.slice(-4)}`
          : "Choose publisher wallet"}
      </button>
      <button
        className="button full"
        disabled={props.busy}
        onClick={() => props.run(start)}
      >
        {props.busy ? (
          <Loader2 className="spin" size={17} />
        ) : (
          <Wallet size={17} />
        )}{" "}
        Sign in with publisher wallet
      </button>
      <p className="form-note">
        Sign-in uses a message signature and does not send funds. Muse sets up
        its own Circle wallet inside Muse.
      </p>
    </>
  );
}
