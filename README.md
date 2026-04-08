# amoCRM Sim Report (встраивается в Bitrix24)

Отчёты по данным amoCRM, упакованные как локальное приложение
Bitrix24. Bitrix24 здесь — только хост-iframe, данные тянутся
из amoCRM (см. `backend/`), Bitrix24 REST API не используется.

## Структура

```
backend/     — Fastify + TypeScript + Drizzle ORM (Postgres). Тянет данные из amoCRM.
frontend/    — React + Vite + TypeScript + Tailwind. SPA, открывается в iframe Bitrix24.
bitrix-app/  — инструкция по регистрации локального приложения в Bitrix24.
widget/      — устаревший виджет amoCRM (оставлен для истории, не используется).
```

Каждый модуль изолирован — добавление новых отчётов = новая папка
`backend/src/modules/<name>` + новая `frontend/src/features/<name>` без правок
существующего кода.

## Быстрый старт (dev)

```bash
cp .env.example .env
cp backend/.env.example backend/.env
# заполнить amoCRM credentials в backend/.env
docker compose up -d postgres
cd backend && npm install && npm run db:migrate && npm run dev
cd ../frontend && npm install && npm run dev
```

## Параметры amoCRM (текущие)

- Поддомен: `melabs.amocrm.ru`
- Воронка: `4298623`
- Поле «Зарегистрированный номер» (custom field сделки): `539427`

## Установка в Bitrix24

См. [`bitrix-app/README.md`](bitrix-app/README.md). Кратко:

1. Задеплоить фронт + backend за Caddy на `https://account.mskmegafon.ru`
   (см. `Caddyfile`, `docker-compose.prod.yml`).
2. Убедиться, что `frontend/nginx.conf` в проде содержит
   `frame-ancestors https://melabs.bitrix24.ru` и `error_page 405 =200`.
3. В Bitrix24 (`https://melabs.bitrix24.ru`): **Приложения → Разработчикам
   → Другое → Локальное приложение**, указать handler URL
   `https://account.mskmegafon.ru/`, placement = `LEFT_MENU`,
   scope оставить пустым.
