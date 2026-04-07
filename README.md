# amoCRM Sim Report Widget

Виджет amoCRM с отчётом «Сколько номеров оформил каждый сотрудник по дням».

## Структура

```
backend/   — Fastify + TypeScript + Drizzle ORM (Postgres)
frontend/  — React + Vite + TypeScript + Tailwind (SPA, открывается в iframe виджета)
widget/    — amoCRM widget.zip (manifest.json + script.js, открывает iframe фронта)
```

Каждый модуль изолирован — добавление новых отчётов = новая папка `backend/src/modules/<name>` + новая `frontend/src/features/<name>` без правок существующего кода.

## Быстрый старт

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

## Установка виджета в amoCRM

См. `widget/README.md`.
