# Video Script: "Stop Building Webhook Infrastructure"

**Format**: Podcast-style video with screen share / live demos
**Target audience**: Developers with a high-level understanding of Workflow SDK
**Estimated runtime**: 10–12 minutes

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

## ACT 1: THE PROBLEM (1.5–2 min)

### "The naive approach" (~30s)

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
- What if the function times out?
- What if the provider retries and you process the event twice?

### "The 'correct' approach" (~30s)

Show the architecture you actually need:

1. **Webhook handler**: accept event, push to a queue, return 200 immediately
2. **Queue infrastructure**: SQS / Redis / RabbitMQ
3. **Worker/consumer**: pulls from queue, processes with retries
4. **Database**: stores intermediate state between steps
5. **Dead letter queue**: catches permanent failures
6. **Idempotency layer**: deduplicates retried events

"Your 10 lines of business logic just became 6 different systems."

### "The state problem" (~30s)

What if your logic spans _multiple_ webhook events?

- "Wait for payment to succeed, THEN wait for shipping confirmation, THEN send
  receipt"
- Now you need a state machine stored in a database
- Logic is scattered across: webhook handler, queue consumer, state management
  layer, separate files/services

"You can't just read your code top-to-bottom anymore."

### Transition

> "With Workflow SDK, all of this complexity is built-in and handled
> transparently. `let` is your database, `await` is your control flow."

---

## ACT 2: HOOKS — THE CONCEPT (~1.5 min)

### What is a hook?

A hook suspends a workflow until an external event arrives. If you're familiar
with `sleep` — which suspends until a timestamp — a hook is the same idea, but
it suspends until something _calls it_.

```ts
export async function orderWorkflow(orderId: string) {
  "use workflow";

  let order = await processPayment(orderId);

  using hook = createHook({ token: `shipping:${orderId}` });
  let shipment = await hook; // ← workflow SUSPENDS here

  // Resumes when the hook is called — state is preserved
  await sendReceipt(order, shipment);
  return { status: "complete" };
}
```

**Key points:**

- **`createHook({ token })`** registers a token. External systems use this token
  to wake up the workflow via `resumeHook(token, payload)`.
- **`await hook`** suspends the workflow. Zero compute while waiting.
- **`let` is your database** — `order` and `shipment` are local variables, but
  they survive indefinitely.
- **Deterministic tokens** are the key insight. You construct the token from
  information that _both sides_ have — the workflow side and the webhook handler
  side. No database lookup needed to route events.
- Standard patterns just work: `Promise.race([hook, sleep("5m")])` for timeouts,
  `Promise.all(...)` for parallelism. It's just JavaScript.

---

## ACT 3: DEMOS (6–7 min)

Three demos, three hook use cases:

1. **Human-in-the-loop** — suspend until a person takes action
2. **3rd party callback** — suspend until an external service calls back
3. **1st party service** — suspend until your own infrastructure reports back

### Demo 1: Magic Link Login — _human-in-the-loop_ (~2 min)

**Intro**: "Let's start with something everyone has experienced — magic link
email login. The workflow suspends until a human clicks a link."

#### The workflow

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

#### Walk through

- `createWebhook()` generates a unique, public URL — goes right into the email
- `respondWith: 'manual'` means the workflow controls the HTTP response — here
  we redirect the user's browser to the dashboard
- `Promise.race([webhook, sleep("5m")])` — built-in 5-minute timeout
- `using` — auto-disposes the webhook token when the block exits

#### Starting the workflow

```ts
export async function POST(request: Request) {
  const { email } = await request.json();
  const { runId } = await start(emailLogin, [request.url, email]);
  return Response.json({ runId });
}
```

"No queue setup, no Redis, no state management. The user clicks the link, the
workflow resumes, redirects their browser, and returns the result."

**Live demo**: Show the magic link app — enter email, email arrives, click the
link, see the redirect + success.

---

### Demo 2: Storytime Slack Bot — _3rd party callback, multi-event_ (~3 min)

**Intro**: "Now let's look at a real application — a collaborative AI
storytelling Slack bot. This demo shows three powerful patterns: one workflow run
per external entity, deterministic tokens for event routing, and awaiting
multiple webhook events in a loop."

#### How it works

- User types `/storytime` in a Slack channel
- The bot generates a story introduction and posts it as a new thread
- Team members reply in the thread — each reply gets fed to the LLM, which
  continues the story
- After a few iterations, the LLM wraps up and generates a storyboard image

The key insight: **one workflow run per Slack thread**. The thread IS the
workflow. And the comment at the top of the workflow file says it all: _"Look ma,
no queues or KV!"_

#### The hook definition (shared between workflow and webhook handler)

```ts
const slackMessageHookSchema = z.object({
  text: z.string(),
  ts: z.string(),
});

export const slackMessageHook = defineHook({
  schema: slackMessageHookSchema,
});
```

`defineHook` creates a typed, validated hook that's shared across both sides.
The Zod schema ensures that every payload going through the hook has `text` and
`ts`.

#### The workflow

```ts
export async function storytime(slashCommand: URLSearchParams) {
  "use workflow";

  // ... parse channel, generate introduction, post to Slack ...
  // `ts` is the thread's parent message timestamp
  // `channelId` is the Slack channel

  // Register a hook with a DETERMINISTIC token
  const slackMessageEvent = slackMessageHook.create({
    token: `slack-message-webhook:${channelId}:${ts}`,
  });

  // Prompt the first user contribution
  await postSlackMessage({
    channel: channelId,
    thread_ts: ts,
    text: aiResponse.encouragement,
  });

  // Await multiple webhook events in a loop
  for await (const data of slackMessageEvent) {
    messages.push({ role: "user", content: data.text });

    const [aiResponse] = await Promise.all([
      generateStoryPiece(messages, model),
      addReactionToMessage({ channel: channelId, timestamp: data.ts, name: "thinking_face" }),
    ]);

    messages.push({ role: "assistant", content: aiResponse.story });

    await postSlackMessage({
      channel: channelId,
      thread_ts: ts,
      text: aiResponse.encouragement,
    });

    if (aiResponse.done) {
      finalStory = aiResponse.story;
      break;
    }
  }

  // Generate storyboard image, post final story...
}
```

#### Walk through

- **Deterministic token**: `slack-message-webhook:${channelId}:${ts}` — built
  from the channel ID and the thread's parent message timestamp. Both the
  workflow and the webhook handler can construct this independently.
- **`for await...of`**: The hook is an `AsyncIterable`. Each iteration suspends
  the workflow until the next message arrives. Between iterations, no compute is
  running. The `messages` array — the conversation history — is just a local
  variable, durably persisted across suspensions.
- **`Promise.all`**: While waiting for the LLM to generate a response, we
  concurrently add a thinking emoji reaction. Standard JavaScript.
- **`break`**: When the LLM decides the story is complete, we break out of the
  loop. Normal control flow.

#### The webhook handler

```ts
export async function POST(req: Request) {
  const body = await req.json();

  // Slack Events API URL verification
  if (body.type === "url_verification") {
    return new Response(body.challenge);
  }

  const parsed = slackMessageSchema.safeParse(body);
  if (parsed.success) {
    const { channel, thread_ts, bot_id } = parsed.data.event;
    if (!bot_id) {
      try {
        // Reconstruct the SAME deterministic token
        const token = `slack-message-webhook:${channel}:${thread_ts}`;
        await slackMessageHook.resume(token, parsed.data.event);
      } catch (error) {
        // No workflow listening for this thread — that's fine
      }
    }
  }

  return new Response("OK");
}
```

"One webhook handler receives ALL Slack message events. It reconstructs the
token from `channel` + `thread_ts` and calls `resume()`. If no workflow is
listening for that thread, it's a no-op. The routing is implicit in the token."

#### Why this matters

"Think about building this without Workflow SDK. You'd need: a message queue
for incoming Slack events, a database table mapping thread IDs to conversation
state, a worker that processes messages and tracks which iteration of the story
you're on, retry logic, idempotency checks... Here, it's a `for await` loop.
The conversation state is just an array. The thread-to-workflow mapping is just
a string."

---

### Demo 3: Vercel Sandbox — _1st party service callback_ (~1.5 min)

**Intro**: "Last example — your own infrastructure calling back. Vercel Sandbox
lets you spin up ephemeral Linux VMs. Kick off an hours-long job, go on your
commute, and the results are waiting when you arrive."

#### The workflow

```ts
export async function analyzeRepo(repoUrl: string) {
  "use workflow";

  using webhook = createWebhook();

  await launchAnalysis(repoUrl, webhook.url);

  // Workflow suspends — zero compute.
  const result = await webhook;
  const report = await result.json();

  await sendSlackNotification(report);
  return report;
}
```

#### The step that launches the Sandbox

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

- "Your own GPU box, your own build server, your own Sandbox — give it a
  webhook URL, it calls back when done."
- "The Sandbox runs for as long as it needs. The workflow is suspended the whole
  time — zero compute cost."
- "No polling, no cron jobs. The callback pattern is native to the workflow."

---

## ACT 4: RECAP & CLOSE (1 min)

### The three use cases

| Use Case           | Demo           | Hook Type         | Token         |
| ------------------ | -------------- | ----------------- | ------------- |
| Human-in-the-loop  | Magic Link     | `createWebhook()` | Random (auto) |
| 3rd party callback | Slack Bot      | `defineHook()`    | Deterministic |
| 1st party service  | Sandbox        | `createWebhook()` | Random (auto) |

### Closing points

1. **`let` is your database** — durable local variables, no Redis needed
2. **`await hook` is your control flow** — suspend for seconds, hours, weeks
3. **Everything is a Promise** — `for await`, `Promise.race`, `Promise.all` —
   it's just JavaScript
4. **One function, one place** — business logic reads top-to-bottom
5. **Zero-cost suspension** — no compute while waiting
6. **Built-in reliability** — retries, idempotency, exactly-once, all
   transparent

### Closing line

> "Stop building webhook infrastructure. Start writing workflow functions."
