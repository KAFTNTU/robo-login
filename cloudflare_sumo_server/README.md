# RC Сумо (Cloudflare)

Це мінімальний сервер кімнат 1x1 для сумо на Cloudflare Workers + Durable Objects.

## Що робить
- Endpoint: `/ws?room=КОД`
- Перший підключений = `p1`, другий = `p2`
- Клієнти шлють `{t:"input", pid:"p1"|"p2", l:number, r:number}`
- Сервер шле `{t:"state", bots:{p1,p2}, tick, winner}`

## Деплой (коротко)
1) Встанови Node.js LTS
2) Встанови Wrangler:
   `npm i -g wrangler`
3) Логін:
   `wrangler login`
4) У цій папці:
   `npm init -y`
   `npm i -D typescript`
5) Деплой:
   `wrangler deploy`

Docs:
- Durable Objects WebSockets (Hibernation) — https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- DO pricing/limits — https://developers.cloudflare.com/durable-objects/platform/pricing/
