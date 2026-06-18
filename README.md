# plane-webhooks

Express webhook receiver for Plane.so -> Telegram + Hermes triage.

## Flow

- Plane sends `POST /webhooks/plane`.
- Receiver verifies `X-Plane-Signature` with HMAC-SHA256 and `PLANE_WEBHOOK_SECRET`.
- Receiver deduplicates retries with `X-Plane-Delivery`.
- Receiver responds `HTTP 200` after validation, then processes Telegram/Hermes asynchronously.
- Task is stored in state.
- Telegram receives the task card.
- Hermes replies `READY`, `BLOCKED`, or `NEED APPROVAL`.
- Owner can approve through `POST /owner/approve`.

## Env

Copy `.env.example` to `.env` for local runs. In Railway, set the same values in Variables.

- `PLANE_WEBHOOK_SECRET` required, copied from Plane webhook secret CSV.
- `TELEGRAM_BOT_TOKEN` required for Telegram delivery.
- `TELEGRAM_CHAT_ID` required for Telegram delivery.
- `PLANE_USER_EMAIL` optional, filters issue notifications by assignee email/name.
- `DELIVERY_CACHE_LIMIT` optional, default `1000` delivery IDs kept in memory.
- `STATE_FILE` optional, default `data/state.json`.
- `PORT` optional, default `3000` locally. Railway provides this automatically.

## Run

```bash
npm install
npm start
```

## Test

```bash
npm test
```

## Endpoints

- `GET /health`
- `POST /webhooks/plane`
- `POST /owner/approve`

## Plane setup

Use a publicly accessible non-localhost URL in Plane:

```text
https://your-domain/webhooks/plane
```

Plane sends JSON payloads with these relevant headers:

- `X-Plane-Delivery`: unique delivery ID.
- `X-Plane-Event`: event type, for example `issue` or `issue_comment`.
- `X-Plane-Signature`: HMAC-SHA256 signature generated from the webhook secret and raw payload.

`PLANE_WEBHOOK_SECRET` must match the secret Plane generates when the webhook is created.

## Owner approve example

```bash
curl -X POST https://your-domain/owner/approve \
  -H 'content-type: application/json' \
  -d '{"taskId":"PL-1234"}'
```
