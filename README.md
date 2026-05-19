# Creative Studio — ApplyFT

AI-powered генератор рекламных креативов в нескольких форматах.

## Стек
- **Next.js 14** (App Router)
- **NextAuth** (Google OAuth, только @applyft.co)
- **Imagen 3** (Google AI) — генерация изображений
- **GPT-4o** (OpenAI) — генерация промптов + анализ референсов
- **Sharp** — ресайз под форматы
- **Prisma + PostgreSQL** — БД
- **Railway** — хостинг

---

## Запуск локально

### 1. Установи зависимости
```bash
npm install
```

### 2. Создай .env файл
```bash
cp .env.example .env
```
Заполни все переменные в `.env`

### 3. Google OAuth
1. Зайди на console.cloud.google.com
2. Создай проект (или используй существующий от n8n)
3. APIs & Services → Credentials → Create OAuth 2.0 Client
4. Authorized redirect URIs добавь: `http://localhost:3000/api/auth/callback/google`
5. Скопируй Client ID и Client Secret в `.env`

### 4. NEXTAUTH_SECRET
```bash
openssl rand -base64 32
```
Скопируй результат в NEXTAUTH_SECRET в `.env`

### 5. Настрой БД
```bash
npm run db:push
```

### 6. Запусти
```bash
npm run dev
```
Открой http://localhost:3000

---

## Деплой на Railway

1. Создай новый проект на railway.app
2. Add Service → GitHub Repo (подключи репо)
3. Add Service → PostgreSQL (Railway создаст БД автоматически)
4. В Variables добавь все переменные из .env.example
5. В NEXTAUTH_URL укажи твой Railway URL
6. В Google Console добавь Railway URL в Authorized redirect URIs
7. Deploy!

---

## Флоу
1. Логин через Google (@applyft.co)
2. Напиши бриф + загрузи референс конкурента (опционально)
3. GPT-4o анализирует и генерирует промпт
4. Редактируй промпт если нужно
5. Выбери форматы (Instagram, Facebook, Google Ads, LinkedIn)
6. Imagen 3 генерирует → Sharp ресайзит → Скачай всё
