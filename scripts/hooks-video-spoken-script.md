# Hooks & Webhooks — Spoken Script

**Format**: Podcast-style video. Pranay (host) + Nathan (guest).
**Screen**: Code editor / screen share throughout. Pranay and Nathan on camera in corner.
**Tone**: Conversational, technical, enthusiastic but not hype-y.

---

## INTRO — Pranay sets it up

**PRANAY**: So one of the things that people keep asking about is hooks —
how do you actually connect a workflow to the outside world? Like, a webhook
comes in from Slack, or a user clicks a link in an email... how does that
wake up a workflow? Nathan, you've been deep in this. Walk us through it.

**NATHAN**: Yeah — so hooks are actually my favorite feature in Workflow SDK.
I remember about a year ago when you first pitched the hook API to me, and
that was honestly the moment the whole workflow programming model clicked
for me. I was... *hooked*.

**PRANAY**: [groan]

**NATHAN**: But seriously — the idea that you can just `await` an external
event inside a workflow function, and the whole thing suspends with zero
compute until that event arrives... that's when I realized this isn't just
a queue wrapper. It's a fundamentally different way to write backend code.

So let me show you what I mean. I want to start by showing a concrete
example of the *problem* hooks solve, and then show how hooks make it
trivial.

---

## ACT 1 — The Traditional Approach (screen share: magic link repo)

> Screen: Open `workflow-magic-link-example` in the editor.
> Navigate to `app/api/traditional/`

**NATHAN**: Let's take magic link login. Everyone's used it — you enter your
email, get a link, click it, you're in. Simple from the user's side. But
let's look at what it takes to build this *without* Workflow SDK.

> Screen: Open `lib/login-store.ts`

First, you need a state store. Here's our Redis layer. We've got a
`LoginSession` interface — email, token, status, timestamps, result data.
Then we have `createSession` which writes *two* keys to Redis — one keyed
by session ID, one keyed by token, because we need to look up sessions
from both directions. Both with a 5-minute TTL. And `completeSession` that
updates the session, preserves the TTL, and cleans up the token key.

That's about 90 lines just for the state management, and we haven't
written any business logic yet.

> Screen: Open `app/api/traditional/send/route.ts`

Now here's endpoint one of three — the "send" endpoint. Generate a random
session ID, generate a random token, store both in Redis, build the verify
URL, send the email with Resend. Return the session ID so the client can
poll.

> Screen: Open `app/api/traditional/verify/route.ts`

Endpoint two — the "verify" endpoint. This is what runs when the user
clicks the link in their email. Look up the token in Redis — that's the
reverse mapping we set up earlier. Fetch the full session. Check if it's
still pending. Check if it's expired. Fetch the Gravatar. Then update the
session in Redis to mark it as completed. Redirect the browser.

Notice how the business logic — the Gravatar lookup, the session
completion — is in the *webhook handler*, not where you'd expect it. The
logic that conceptually belongs to the "login flow" is spread across
multiple files, connected only by Redis keys.

> Screen: Open `app/api/traditional/status/route.ts`

And endpoint three — the polling endpoint. Read from Redis, return the
status. The client hits this every second or two to check if the user
clicked the link yet.

> Screen: Show all four files side by side or in quick succession

So to recap: we have a Redis store, three API endpoints, two Redis key
patterns, manual TTL management, and the business logic is scattered
across all of it. And this is the *simple* case — one email, one click.
Imagine chaining multiple webhook events together.

---

## ACT 2 — Hooks to the Rescue (screen share: workflow version)

> Screen: Open `workflows/login-email.ts`

**NATHAN**: Now let me show you the same thing with Workflow SDK.

```ts
export async function doEmailLogin(url: string, email: string) {
  "use workflow";

  const webhook = createWebhook({ respondWith: "manual" });

  await sendLoginEmail(email, new URL(webhookUrl.pathname, url));

  const req = await Promise.race([webhook, sleep("5m")]);
  if (!req) throw new Error("Login email timed out");

  await redirectWebhook(req, new URL("/login-success", url));

  const avatar_url = await getGravatarUrl(email);

  return { type: "email", login: email, avatar_url };
}
```

That's it. The entire login flow. One function. Read it top to bottom — send
the email, wait for the click, redirect the user, get the avatar, return.

**PRANAY**: And the state? The email address, the webhook token...

**NATHAN**: They're just local variables. `email` is a parameter, `webhook`
is a local — they're durable. They survive the suspension. When the user
clicks the link and the workflow resumes, everything is right where we left
it. No Redis, no session table, no two-key lookup pattern.

Let me walk through the key parts.

`createWebhook()` — this generates a unique public URL. That URL goes
right into the email. When someone hits that URL, it wakes up this workflow.

`respondWith: 'manual'` — this means we control the HTTP response. When
the user clicks the link, we get the request object, and here we redirect
their browser to the success page. The response flows back through the
webhook to the user's browser. Pretty wild.

`Promise.race([webhook, sleep("5m")])` — built-in timeout. If the user
doesn't click within 5 minutes, `sleep` wins the race and we get `null`.
No setTimeout, no cron job cleaning up expired sessions, no Redis TTLs.

> Screen: Open `app/api/login/email/route.ts`

And to start the workflow? Four lines.

```ts
export async function POST(request: Request) {
  const { email } = await request.json();
  const { runId } = await start(doEmailLogin, [request.url, email]);
  return Response.json({ runId });
}
```

No Redis. No token generation. No session creation. Just start the
workflow and return the run ID.

**PRANAY**: So the Redis, the multiple endpoints, the token management —
all of that is just... gone?

**NATHAN**: Gone. The framework handles it. The webhook URL generation,
the suspend/resume, the state persistence, the timeout cleanup — it's
all built in. Your code is just the business logic.

---

## ACT 2.5 — What is a hook, exactly?

**NATHAN**: OK so let me zoom out for a second and explain hooks more
generally, because the magic link used `createWebhook` which is a specific
flavor. The core primitive is `createHook`.

If you're familiar with `sleep` in Workflow SDK — which suspends a workflow
until a timestamp — a hook is the same idea. It suspends the workflow until
an external event arrives.

You create a hook with a **token** — a string that identifies it. Then
some external system — a webhook handler, another service, whatever — calls
`resumeHook(token, payload)` to wake up the workflow and deliver data.

The key insight is **deterministic tokens**. You construct the token from
information that *both sides* know. The workflow side knows it because it
computed it. The webhook handler side knows it because it's in the event
payload. No database lookup needed to route the event to the right workflow.

And because hooks are just Promises, all the standard JavaScript patterns
work. `Promise.race` for timeouts. `Promise.all` for parallelism.
`for await...of` for receiving multiple events. It's just JavaScript.

Let me show you what I mean with a more complex example.

---

## DEMO 2 — Storytime Slack Bot (screen share: storytime-slackbot repo)

> Screen: Open `storytime-slackbot` in the editor

**NATHAN**: This is a real app we built — a collaborative AI storytelling
Slack bot. You type `/storytime` in a channel, it generates a story
introduction, and then your team replies in the thread to continue the
story. Each reply gets fed to the LLM, and after a few rounds, it wraps
up and generates a storyboard image.

The architecture is: **one workflow run per Slack thread**. The thread
*is* the workflow. And I love the comment at the top of the workflow file —
"Look ma, no queues or KV!"

> Screen: Open `workflows/create.ts`, scroll to the hook definition

First, the hook definition:

```ts
const slackMessageHookSchema = z.object({
  text: z.string(),
  ts: z.string(),
});

export const slackMessageHook = defineHook({
  schema: slackMessageHookSchema,
});
```

`defineHook` creates a typed, validated hook. The Zod schema ensures every
payload has `text` and `ts`. This definition is shared between the workflow
and the webhook handler — type safety across the boundary.

> Screen: Scroll to the `storytime` function, highlight the token creation

Now in the workflow, after we post the story introduction to Slack and get
back the thread timestamp, we create the hook:

```ts
const slackMessageEvent = slackMessageHook.create({
  token: `slack-message-webhook:${channelId}:${ts}`,
});
```

**Deterministic token** — channel ID plus thread timestamp. Both the
workflow and the webhook handler can construct this independently. No
lookup table.

> Screen: Highlight the `for await` loop

And here's the magic — we `for await` over the hook:

```ts
for await (const data of slackMessageEvent) {
  messages.push({ role: "user", content: data.text });
  const [aiResponse] = await Promise.all([
    generateStoryPiece(messages, model),
    addReactionToMessage({ ... }),
  ]);
  // ... post response, check if done ...
  if (aiResponse.done) break;
}
```

Each iteration of the loop suspends the workflow until the next message
arrives in the thread. Between messages, zero compute. The `messages`
array — the entire conversation history — is just a local variable,
durably persisted across every suspension.

And look — `Promise.all` to run the LLM call and add the thinking emoji
reaction concurrently. `break` to exit when the story is done. Normal
JavaScript control flow.

> Screen: Open `app/api/slack/webhook/route.ts`

Now the webhook handler — this is the *only* endpoint that Slack calls:

```ts
const token = `slack-message-webhook:${channel}:${thread_ts}`;
await slackMessageHook.resume(token, parsed.data.event);
```

It reconstructs the same deterministic token from the event data and
calls `resume()`. If no workflow is listening for that thread, it's a
no-op. One handler routes events to any number of concurrent storytime
workflows, all based on the token string.

**PRANAY**: And this could be hundreds of active story threads at once?

**NATHAN**: Exactly. Each one is its own workflow run, suspended between
messages, zero compute. And each one maintains its own conversation
history as a local variable. No shared database table, no message queue.
Just... functions.

Think about building this the traditional way. You'd need a message
queue for incoming Slack events, a database table mapping thread IDs to
conversation state, a worker that processes messages and tracks which
iteration of the story each thread is on, retry logic, idempotency
checks... Here, it's a `for await` loop.

---

## DEMO 3 — Sandbox FFmpeg Converter (screen share: sandbox repo)

> Screen: Open `workflow-sandbox-ffmpeg-example`

**NATHAN**: One more example, different use case. This one shows hooks
with your *own* infrastructure calling back — specifically a Vercel Sandbox.

The idea: you kick off a long-running ffmpeg conversion inside a Sandbox
VM, and the workflow suspends while it runs. When ffmpeg finishes, the
Sandbox curls the webhook URL, and the workflow wakes back up.

> Screen: Open `workflows/convert.ts`

Here's the workflow. First, we create a Sandbox:

```ts
const sandbox = await Sandbox.create({ timeout: 5 * 60 * 1000 });
```

This is a real VM — and this call runs as a durable step directly in the
workflow function. The Sandbox object is automatically serialized across
step boundaries thanks to the `WORKFLOW_SERIALIZE` protocol. No wrapper
needed.

Then we install ffmpeg, download the input file, collect metadata — each
one is a visible durable step with stdout/stderr. If anything fails, we
see exactly what happened.

Then the webhook part:

```ts
const webhook = createWebhook();
const callbackUrl = new URL(webhook.url, baseUrl).href;
```

We write a shell script to the Sandbox that runs ffmpeg and curls the
callback URL when done, start it in the background, and then:

```ts
const result = await Promise.race([webhook, sleep("5m")]);
```

Workflow suspends. Zero compute. The Sandbox does the conversion — could
take 10 seconds, could take 10 minutes. When it's done, curl hits the
webhook, workflow resumes, we read the metadata, stop the Sandbox, return.

The key pattern here is: give any long-running process a webhook URL, let
it call you back. Your own GPU box, a build server, a Sandbox. The
workflow just... waits.

---

## CLOSE

**PRANAY**: So to recap — hooks are basically: suspend a workflow until
something external happens.

**NATHAN**: Right. And the three patterns we showed map to most real-world
use cases:

**Human-in-the-loop** — a person clicks a link, approves a request, sends
a message. The magic link demo.

**Third-party callback** — a service like Slack, Stripe, OpenAI calls your
webhook. The storytime bot.

**First-party service** — your own infrastructure reports back when work is
done. The Sandbox demo.

And in every case, the workflow code reads top to bottom. `let` is your
database — no Redis, no state tables. `await hook` is your control flow —
no scattered handlers stitched together with message queues. Everything is
a Promise, so standard JavaScript patterns just work.

**PRANAY**: Stop building webhook infrastructure.

**NATHAN**: Start writing workflow functions.
