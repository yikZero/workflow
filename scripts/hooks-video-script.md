# Video Script: "Stop Building Webhook Infrastructure"

**Format**: Podcast-style video with screen share / live demos
**Target audience**: Mixed / broad (assume minimal webhook infrastructure background)
**Estimated runtime**: 12–15 minutes

---

## COLD OPEN (30s)

Start with a dramatic code contrast. Screen shows a messy architecture diagram
(webhook handler → queue → worker → Redis → dead letter queue), then cuts to:

```ts
using hook = createHook({ token: `order:${orderId}` });
const result = await hook;
```

> "What if handling webhooks was just... `await`?"

---

## ACT 1: THE PROBLEM (2.5–3 min)

### Beat 1: "What is a webhook?" (~30s)

- Third-party service needs to tell your app something happened
- Instead of you polling them, they call YOU
- Example: Stripe charges a customer → sends you an HTTP POST with the event
- Sounds simple, right?

### Beat 2: "The naive approach" (~45s)

Show a simple webhook handler:

```ts
export async function POST(request: Request) {
  const event = await request.json();
  await processPayment(event);   // talk to your DB
  await sendConfirmation(event);  // send an email
  await updateInventory(event);   // update stock
  return new Response("OK");
}
```

"This looks clean, but it's a house of cards."

- What if `sendConfirmation` fails after `processPayment` succeeded?
- What if the function times out (serverless has limits)?
- What if Stripe retries and you process the payment twice?
- What if your server is down when the webhook fires?

### Beat 3: "The 'correct' approach" (~45s)

Show the architecture you actually need:

1. **Webhook handler**: accept event, push to a queue, return 200 immediately
2. **Queue infrastructure**: SQS / Redis / RabbitMQ
3. **Worker/consumer**: pulls from queue, processes with retries
4. **Database**: stores intermediate state between steps
5. **Dead letter queue**: catches permanent failures
6. **Idempotency layer**: deduplicates retried events

"Your 10 lines of business logic just became 6 different systems."

### Beat 4: "The state problem" (~30s)

What if your logic spans _multiple_ webhook events?

- "Wait for payment to succeed, THEN wait for shipping confirmation, THEN send receipt"
- Now you need a state machine stored in a database
- Code is scattered across: webhook handler, queue consumer, state management
  layer, separate files/services

"You can't just read your code top-to-bottom anymore."

### Transition

> "What if there was a way to write this as a single, linear function — where
> `let` is your database and `await` is your control flow?"

---

## ACT 2: THE PARADIGM SHIFT (1.5–2 min)

Introduce Workflow SDK hooks at a conceptual level.

### The mental model

**Traditional** (code is scattered):

```
webhook-handler.ts  →  queue.ts  →  worker.ts  →  redis-state.ts
     (accept)         (enqueue)    (process)     (read/write state)
```

**Workflow SDK** (code is one function):

```ts
export async function orderWorkflow(orderId: string) {
  "use workflow";

  let order = await processPayment(orderId);

  // Create a hook and wait for shipping confirmation
  using hook = createHook({ token: `shipping:${orderId}` });
  let shipment = await hook; // ← workflow SUSPENDS here

  // Resumes when hook is called — state is preserved
  await sendReceipt(order, shipment);
  return { status: "complete" };
}
```

### Key concepts to explain (visually if possible)

1. **`"use workflow"`** — This function is special. It's orchestration code that
   the framework manages.
2. **`using hook = createHook(...)`** — Registers a token that external systems
   can use to wake up this workflow. The `using` keyword means the token is
   automatically cleaned up when the block exits.
3. **`await hook`** — The workflow _suspends_. No compute is running. No server
   is spinning. The function's local state is durably persisted.
4. **When `resumeHook(token, payload)` is called** — The framework replays the
   workflow from the beginning, fast-forwarding through completed steps, and
   delivers the payload to the awaiting hook.
5. **`let` is your database** — `order` and `shipment` are just local variables,
   but they survive days, weeks, indefinitely.

### Emphasize the DX inversion

- Traditional: code is scattered across handler → queue → worker → database
- Workflow SDK: code is one function, reads top-to-bottom, your business logic
  is the whole thing

---

## ACT 3: DEMOS (6–8 min)

### Demo 1: Magic Link Login (~2 min)

**Intro**: "Let's start with something everyone has experienced — magic link
email login. You enter your email, get a link, click it, and you're logged in.
Simple from the user's perspective, but surprisingly tricky to build correctly."

#### Show the workflow code

```ts
export async function emailLogin(url: string, email: string) {
  "use workflow";

  using webhook = createWebhook({ respondWith: "manual" });

  await sendLoginEmail(email, webhook.url);

  const req = await Promise.race([webhook, sleep("5m")]);
  if (!req) throw new Error("Login timed out");

  await redirectUser(req, new URL("/dashboard", url));
  return { email, avatar: await getGravatar(email) };
}
```

#### Walk through the code

- `createWebhook()` generates a unique, public URL — "this URL goes right into
  the email"
- `respondWith: 'manual'` means when someone hits that URL, WE control the HTTP
  response — "we redirect their browser to the dashboard"
- `Promise.race([webhook, sleep("5m")])` — "built-in 5-minute timeout, no
  setTimeout, no cron cleanup"
- `using` keyword — "when the block exits, the webhook token is disposed — no
  stale tokens hanging around"

#### Show the API route that starts the workflow

```ts
export async function POST(request: Request) {
  const { email } = await request.json();
  const { runId } = await start(emailLogin, [request.url, email]);
  return Response.json({ runId });
}
```

"That's it. No queue setup, no Redis, no state management. The user clicks the
link, the workflow resumes, redirects their browser, and returns the result."

**Live demo**: Show the updated magic link app running — enter email, show the
email arriving, click the link, see the redirect + success state.

---

### Demo 2: OpenAI Background Response (~1.5 min)

**Intro**: "Same pattern, different use case. OpenAI has a 'background' mode for
long-running responses. You kick off the request, and they call you back when
it's done. Perfect for hooks."

#### Show the code

```ts
export async function withCreateHook() {
  "use workflow";

  const respId = await initiateOpenAIResponse();

  using hook = createHook<{ type: string; data: { id: string } }>({
    token: `openai:${respId}`,
  });

  const payload = await hook;

  if (payload.type === "response.completed") {
    const text = await getOpenAIResponse(payload.data.id);
  }
}
```

#### Key insight — the deterministic token pattern

```ts
// Workflow side:
token: `openai:${respId}`;

// Webhook handler side:
const event = await request.json();
const token = `openai:${event.data.id}`;
await resumeHook(token, event);
```

"Notice what's happening — we don't store the token anywhere. We _reconstruct_
it from the event data. The response ID is the shared key between the workflow
and the webhook handler. No database lookup needed."

"This pattern works for any provider that includes an identifier in their
callback — Stripe, Twilio, Resend, you name it."

---

### Demo 3: GitHub Webhook Routing (~2 min)

**Intro**: "Now let's get more ambitious. What if your workflow needs to wait for
MULTIPLE webhook events in sequence? Like: wait for a PR to be approved, then
wait for CI to pass, then auto-merge."

#### Show the workflow

```ts
export async function autoMerge(repo: string, prNumber: number) {
  "use workflow";

  // Phase 1: Wait for approval
  {
    using hook = createHook<GitHubEvent>({
      token: `github:${repo}:${prNumber}:review`,
    });
    const review = await hook;
    if (review.state !== "approved") {
      return { status: "rejected" };
    }
  } // ← hook disposed, token freed

  // Phase 2: Wait for CI
  {
    using hook = createHook<GitHubEvent>({
      token: `github:${repo}:${prNumber}:checks`,
    });
    const checks = await hook;
    if (checks.conclusion !== "success") {
      return { status: "ci-failed" };
    }
  }

  // Phase 3: Merge
  await mergePullRequest(repo, prNumber);
  return { status: "merged", pr: prNumber };
}
```

#### Talking points

- "Read this code. It's a checklist. Wait for approval, wait for CI, merge.
  That IS the business logic."
- "Each `using` block scopes the hook's lifetime. When the approval phase is
  done, that token is freed."
- "Building this with traditional webhooks means a state machine, a database
  table tracking which PRs are in which phase, and handler code that checks
  'is this PR waiting for approval or CI?'"

#### Show the single webhook handler

```ts
export async function POST(request: Request) {
  const event = await request.json();
  const eventType = request.headers.get("x-github-event");

  let token: string | undefined;
  if (eventType === "pull_request_review") {
    const { number } = event.pull_request;
    token = `github:${event.repository.full_name}:${number}:review`;
  } else if (eventType === "check_suite" && event.action === "completed") {
    const pr = event.check_suite.pull_requests[0];
    if (pr)
      token = `github:${event.repository.full_name}:${pr.number}:checks`;
  }

  if (token) {
    try {
      await resumeHook(token, event);
    } catch (e) {
      // Hook not found — no workflow waiting for this event, ignore
    }
  }
  return new Response("OK");
}
```

"One webhook handler. It reconstructs the token from the event data and calls
`resumeHook`. If no workflow is waiting for that token, it's a no-op. The
routing is implicit in the token convention."

---

### Demo 4: Vercel Sandbox + Long-Running Task (~1.5 min)

**Intro**: "For our last example, let's combine hooks with Vercel Sandbox.
Sandbox lets you spin up ephemeral Linux VMs. Imagine kicking off an hours-long
code analysis, going on your commute, and having the results waiting when you
arrive."

#### Show the workflow

```ts
export async function analyzeRepo(repoUrl: string) {
  "use workflow";

  using webhook = createWebhook();

  await launchAnalysis(repoUrl, webhook.url);

  // Workflow suspends here — no compute running.
  // Go grab lunch. Take a walk. Commute home.
  const result = await webhook;
  const report = await result.json();

  await sendSlackNotification(report);
  return report;
}
```

#### Show the step that launches the Sandbox

```ts
async function launchAnalysis(repoUrl: string, callbackUrl: string) {
  "use step";
  const sandbox = await Sandbox.create();
  await sandbox.commands.run(`git clone ${repoUrl} /workspace`);
  await sandbox.commands.run(
    `cd /workspace && npm test -- --json > results.json && ` +
      `curl -X POST -H "Content-Type: application/json" ` +
      `-d @results.json ${callbackUrl}`,
    { background: true }
  );
}
```

#### Talking points

- "The Sandbox runs for as long as it needs. The workflow is suspended the whole
  time — zero compute cost."
- "When the Sandbox finishes, it POSTs the results to the webhook URL. That
  wakes up the workflow."
- "No polling. No cron job checking 'is it done yet?' The callback pattern is
  native to the workflow."
- "This could be a 5-minute test suite or a 3-hour data migration. The workflow
  doesn't care — it just waits."

---

## ACT 4: RECAP & CLOSE (1 min)

### Quick visual recap

Show all 4 patterns side by side:

| Pattern   | Hook Type          | Token                | Use Case                   |
| --------- | ------------------ | -------------------- | -------------------------- |
| Magic Link| `createWebhook()`  | Random (auto)        | User clicks a URL          |
| OpenAI    | `createHook()`     | Deterministic        | Provider callback          |
| GitHub    | `createHook()`     | Deterministic        | Multi-event routing        |
| Sandbox   | `createWebhook()`  | Random (auto)        | Long-running task callback |

### Closing points

1. **`let` is your database** — durable local variables, no Redis needed
2. **`await hook` is your control flow** — suspend for minutes, hours, days
3. **One function, one place** — business logic reads top-to-bottom
4. **Zero-cost suspension** — no compute while waiting
5. **Built-in reliability** — retries, replay, exactly-once, all transparent

### Closing line

> "Stop building webhook infrastructure. Start writing workflow functions."
