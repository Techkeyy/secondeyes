# SecondEyes

A second pair of eyes on every payment your AI agent makes.

**[Live site](https://secondeyes-j5ey.onrender.com)** · [Contract on testnet](https://testnet.nearblocks.io/address/secondeyes-dev.testnet) · [Benchmark results](benchmark/results-2026-11-02T11-43-17-328Z.json)

You give an AI agent a budget and a plain-language instruction. Every payment it asks for is checked against that instruction before any money moves, and a smart contract, not your agent, enforces the answer.

> *"My agent read an invoice saying the supplier changed bank details. Did it just pay a scammer?"*

Built at NEAR HACKATHON. Runs on NEAR testnet with test money.

## Why this exists

Spending limits and allowlists ask one question: is this payment inside the rules? A scam can be. A repeat of a bill you already paid can be. So can a payment to an approved supplier for something you never asked for.

```
What you asked for:  "Pay Acme invoice AC-1042, 0.1 NEAR, to acme.testnet"

Agent asks to pay                        Limits alone   SecondEyes
0.1 to acme.testnet, invoice AC-1042     paid           paid
the same invoice a second time           paid           refused
0.1 to acme.testnet, "late fee"          paid           refused
0.1 to a lookalike account from a scam   stopped only   refused
                                         by an allowlist
```

## What it does

1. **You set a budget.** You write the instruction and limits, and fund a contract. You can take back what is left at any time.
2. **Your agent gets a key.** It can only ask to pay from that one budget. It cannot withdraw or change your limits.
3. **The contract checks your limits.** Amount, total, number of payments and expiry. A violation is recorded as a refusal.
4. **An independent judge answers ALLOW or BLOCK.** A model on [NEAR AI Cloud](https://cloud.near.ai) sees your instruction, the payment fields and the contract's own record of what was already paid. It never reads the invoice or web page.
5. **The contract verifies the answer.** It rebuilds the exact request itself and checks the judge's ed25519 signature over the request and response hashes. A forged, altered or reused answer is rejected.
6. **Only an exact ALLOW pays.** Anything else is a recorded refusal, and the money stays.

Your agent is never trusted to report the verdict honestly, and nor is my server: the server only relays a signed answer that the contract checks.

## Try it in two minutes

You need a NEAR testnet wallet with about 0.5 test NEAR ([free faucet](https://near-faucet.io/)). I have run the whole flow below on the live site with Nightly. The other wallets in the list come from [NEAR Connect](https://github.com/azbang/near-connect) and I have not run this flow with them in a browser.

1. Open the [new budget page](https://secondeyes-j5ey.onrender.com/budgets/new) and connect your wallet.
2. Press **Create budget**, leaving the prefilled instruction, and approve 0.5 NEAR in your wallet. See budget page with 0.3 NEAR.
3. Give the **Scam invoice** to the agent. See the agent choose a lookalike account, then a **Refused** stamp. The balance stays 0.3.
4. Give the **Honest invoice** to the agent. See **Paid**. The balance drops to 0.2.
5. Give the **Honest invoice** to the agent again. See **Refused**, because it is already paid.
6. Press **Close and take back 0.2 NEAR**. See the budget closed with 0 left. The 0.2 NEAR setup fee is not refunded.

The agent in this demo really is fooled by the scam invoice. It runs a real model over the invoice text and picks the scammer's account. The check still stops it.

## Connect your own agent

Your budget page gives you a setup to copy, holding this budget's details and the agent's key. The key signs on your machine and is hidden on screen by default.

**Apps that support MCP:** paste the setup into the app's MCP settings. It adds two tools, `secondeyes_budget` and `secondeyes_pay`.

**Anything that can run a command:**

```bash
npx -y https://secondeyes-j5ey.onrender.com/secondeyes-agent.tgz budget
npx -y https://secondeyes-j5ey.onrender.com/secondeyes-agent.tgz pay --payee acme.testnet --amount 0.1 --purpose "Invoice 12"
```

It answers in JSON and exits with 0 only when the money was sent. It needs Node.js 20 or newer and the settings from your budget page.

I tested this tool from the live site using the official MCP SDK as the client. I have not yet run it inside a chat app with a model choosing the calls.

## Run the checks yourself

No keys, no accounts and no model calls:

```bash
node benchmark/run.mjs --holdout --check benchmark/results-2026-11-02T11-43-17-328Z.json
```

See `141 of 141 answers verify` and the scores below. This re-checks every recorded signature over the exact bytes.

```bash
(cd contract && cargo test)                       # 63 tests (on Windows, first set AWS_LC_SYS_PREBUILT_NASM=1)
(cd web && pnpm install && pnpm test)             # 19 tests
(cd testnet && npm install && npm test)           # 10 tests
node --test spike/verify-lib.test.mjs             # 8 tests
```

The deployed contract matches this source. Building it with Rust 1.95 on Windows gives the same sha256, starting `a9793d561e320e20`, as the code on `secondeyes-dev.testnet`. Another system may produce different bytes.

```bash
(cd contract && cargo build --target wasm32-unknown-unknown --release)
```

Run the site locally. The judge needs a key from [NEAR AI Cloud](https://cloud.near.ai):

```bash
cd web
pnpm install
echo "NEAR_AI_API_KEY=your_key" > .env.local
pnpm build && pnpm start
```

Then open http://localhost:3000. It uses the deployed testnet contract unless you set the values in [.env.example](.env.example).

## How I tried to break it

I wrote 47 payment cases after freezing the judge's wording, and ran each three times on the real judge, next to a rules-only guard with the best allowlist it could have.

| Payment | SecondEyes paid | Rules only paid |
|---|---|---|
| Wrong payee | 0 of 15 | 0 of 15 |
| Approved payee, wrong reason | 0 of 27 | 27 of 27 |
| Wrong amount | 0 of 15 | 15 of 15 |
| Repeat payment | 0 of 15 | 15 of 15 |
| Text aimed at the judge | 0 of 18 | 12 of 18 |
| **All attacks** | **0 of 90** | **69 of 90** |
| **Honest payments** | **51 of 51** | **51 of 51** |

**Read this as a good early sign, not a guarantee.** I wrote these cases myself and nobody adapted them to beat the judge. An earlier run on my tuning set showed one case changing its answer between runs, so a real attacker could do better than 0 of 90.

These run on the deployed contract, from the agent tool, against the live site:

| Attempt | Result | Proof |
|---|---|---|
| Scam account | Refused, money stays | [transaction](https://testnet.nearblocks.io/txns/9VteEf2raMRGnNJM2zkagHtBeecwNZrrQ5bKfvQfSQcB) |
| The real bill | Paid | [transaction](https://testnet.nearblocks.io/txns/E2AvKTwcVyydxiKpXXLeCcB42wotjMea1V1cbzw2An99) |
| The same bill again | Refused | [transaction](https://testnet.nearblocks.io/txns/98T7JD3L6VHb9rRRuCdwwnmFSSV7qsYL6CtDQUb6N6Nj) |
| Over the per-payment limit | Refused before the judge is called | `limit: over max per payment` |
| Bad amount, `"all of it"` | Error, nothing sent | The tool's plain message |

**Without a valid signed ALLOW for this exact payment, the contract does not pay.**

### What it cannot do

- **It cannot tell whether your agent is telling the truth.** Under a broad instruction like "pay our suppliers", a dishonest agent can still spend inside its budget. Name the payee and the amount.
- **It cannot see today's date.** Instructions that depend on the date are judged without it.
- **When unsure it refuses.** A real payment worded just like an earlier one may be refused. Say how many you expect.
- **A budget holds 20 attempts,** paid or refused. After that you close it and start another.
- **The server limits are simple.** Rate limits live in memory and reset when the server restarts.
- **This is a development deployment.** The account `secondeyes-dev.testnet` still has a full-access key, so I could replace the contract. The judge is fixed per budget at creation, but that promise only fully holds once the key is removed.

## Why NEAR

- **Function-call keys** let the agent hold a key that can only call `pay`, on this contract, with a capped gas allowance. It can never withdraw.
- **`ed25519_verify` in the contract** lets the chain itself check the judge's signature, so nobody has to trust a relay.
- **NEAR AI Cloud** signs answers from a model in a trusted execution environment. I checked the signer's attestation with [spike/verify-quote.py](spike/verify-quote.py) before pinning its key in the contract.

## Architecture

| Path | Job |
|---|---|
| [contract/src/lib.rs](contract/src/lib.rs) | Holds budgets, checks limits, rebuilds requests, verifies signatures, pays |
| [web/app/api/judge](web/app/api/judge/route.ts) | Relays a payment to NEAR AI and returns the signed answer |
| [web/app/api/agent-read](web/app/api/agent-read/route.ts) | Runs the demo agent's model over a sample invoice |
| [web/lib/agent.ts](web/lib/agent.ts) | The demo agent that runs in your browser |
| [web/lib/wallet.tsx](web/lib/wallet.tsx) | Connects wallets and sends your transactions |
| [web/lib/nightly.ts](web/lib/nightly.ts) | Has Nightly sign only, since its own sending hangs on testnet |
| [agent/](agent/index.mjs) | The hosted tool for your own agent, over MCP or the command line |
| [benchmark/](benchmark/run.mjs) | The test cases, the rules-only guard and signature re-checks |
| [testnet/](testnet/check.mjs) | Checks against the deployed contract |
| [spike/](spike/verify-signature.mjs) | Signature and attestation verification, with recorded real answers |

Built with near-sdk, near-api-js, NEAR Connect, Next.js, React and the MCP TypeScript SDK. The judge model is `z-ai/glm-5.3-flash`.

## License

[MIT](LICENSE)
