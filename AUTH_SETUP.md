# 🔐 Налаштування авторизації для RoboScratch

## Що додано
- Авторизація через **Email + Пароль**
- Авторизація через **Google OAuth**
- База даних **Cloudflare D1** (безкоштовно!)
- **JWT токени** для сесій (дійсні 30 днів)

---

## 📋 Кроки налаштування

### 1. Встановити Wrangler (якщо ще не встановлено)
```bash
npm install -g wrangler
npx wrangler login
```

### 2. Створити D1 базу даних
```bash
cd cloudflare_sumo_server
npx wrangler d1 create roboscratch-users
```
Копіюй `database_id` з виводу та встав у `wrangler.toml`:
```toml
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 3. Застосувати схему бази даних
```bash
# Для продакшену
npx wrangler d1 execute roboscratch-users --file=schema.sql --remote

# Для локальної розробки
npx wrangler d1 execute roboscratch-users --file=schema.sql --local
```

### 4. Встановити секрети
```bash
# Секрет для підпису JWT (будь-який довгий рядок)
npx wrangler secret put JWT_SECRET
# Введи: будь-який довгий рядок, наприклад: my-super-secret-key-2025-roboscratch

# (Після налаштування Google OAuth)
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

### 5. Налаштування Google OAuth (безкоштовно)

1. Зайди на https://console.cloud.google.com
2. Створи новий проект (або вибери існуючий)
3. Зайди в **APIs & Services → Credentials**
4. Натисни **Create Credentials → OAuth 2.0 Client ID**
5. Тип: **Web application**
6. Додай Authorized redirect URI:
   ```
   https://rc-sumo-server.kafrdrapv1.workers.dev/auth/google/callback
   ```
7. Скопіюй **Client ID** та **Client Secret**

Встав Client ID у `wrangler.toml`:
```toml
GOOGLE_CLIENT_ID = "123456789-xxx.apps.googleusercontent.com"
```

Встанови Client Secret як секрет:
```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
# Вводь Client Secret від Google
```

### 6. Задеплоїти
```bash
npm run deploy
# або
npx wrangler deploy
```

---

## 🗂 Структура файлів

```
cloudflare_sumo_server/
├── src/
│   ├── index.ts          ← Головний воркер (Auth + WebSocket)
│   └── auth-utils.ts     ← JWT, хешування паролів, CORS
├── schema.sql            ← SQL схема бази даних
└── wrangler.toml         ← Конфігурація (з D1 binding)

index.html                ← Фронтенд (модальне вікно авторизації вбудовано)
```

---

## 🔌 API ендпоінти

| Метод | URL | Опис |
|-------|-----|------|
| POST | `/auth/register` | Реєстрація email/пароль |
| POST | `/auth/login` | Вхід email/пароль |
| GET | `/auth/google` | Редирект на Google OAuth |
| GET | `/auth/google/callback` | Коллбек від Google |
| GET | `/auth/me` | Інфо про поточного користувача |

---

## 🔒 Безпека
- Паролі хешуються через **PBKDF2 + SHA-256** (100,000 ітерацій)
- JWT підписані через **HMAC-SHA256**
- Токени зберігаються в **localStorage** браузера

---

## 📝 Зміни в index.html
Модальне вікно авторизації додано автоматично. Щоб отримати поточного користувача в своєму JS коді:
```javascript
const user = getAuthUser(); // { id, email, username } або null
const token = getAuthToken(); // JWT рядок або null
```
