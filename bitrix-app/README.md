# Установка приложения в Bitrix24 (melabs.bitrix24.ru)

Это приложение — тонкая обёртка вокруг нашей SPA. Bitrix24 здесь
выступает только как **хост-iframe**: данные продолжают браться из
amoCRM (см. `backend/`), Bitrix24 REST API не используется, токены
B24 не сохраняются.

Поэтому никаких client_id / client_secret / OAuth flow для Bitrix24
заводить не нужно. Достаточно зарегистрировать **локальное приложение**
с одним URL обработчика и одним placement в левом меню.

---

## Что нужно перед установкой

1. Прод-домен фронта работает: <https://account.mskmegafon.ru> отвечает 200 и
   отдаёт SPA. Проверить можно так:
   ```bash
   curl -I https://account.mskmegafon.ru
   ```
2. nginx фронта собран из текущего `frontend/nginx.conf` —
   там добавлен заголовок `Content-Security-Policy: frame-ancestors`
   с разрешением для `https://melabs.bitrix24.ru`, иначе браузер
   откажется встраивать страницу в iframe Bitrix24.
3. Backend (`/api/*`) проксируется на тот же домен через Caddy
   (см. `Caddyfile`) — это обязательно, иначе из iframe будут
   cross-origin запросы к API и упадут на CORS.

---

## Регистрация локального приложения

1. В Bitrix24 зайти под аккаунтом администратора:
   <https://melabs.bitrix24.ru>
2. Слева внизу: **Приложения** → **Разработчикам**.
3. Кнопка **Другое** → **Локальное приложение**.
4. Заполнить поля:

   | Поле                       | Значение                                            |
   | -------------------------- | --------------------------------------------------- |
   | Название                   | `МегаФон · Аналитика`                               |
   | Использует только API      | **Нет** (нам нужен интерфейс в iframe)              |
   | Скрипт обработчик          | `https://account.mskmegafon.ru/`                    |
   | Путь для первичной установки | `https://account.mskmegafon.ru/`                  |
   | Назначение                 | **Меню слева** (`LEFT_MENU`)                        |
   | Меню — название пункта     | `МегаФон · Аналитика`                               |
   | Меню — иконка              | загрузить `bitrix-app/icon.svg` или любую 32×32 SVG |
   | Права доступа (scope)      | оставить пустым (REST API мы не вызываем)           |

5. Сохранить. Bitrix24 покажет `client_id` / `client_secret` —
   их **сохранять не нужно**, токены B24 нам не требуются (см. выше).

6. В левом меню портала появится новый пункт **МегаФон · Аналитика**.
   По клику Bitrix24 откроет наш фронт во встроенном iframe.

---

## Как это работает изнутри

- Bitrix24 при первом открытии handler URL делает в iframe **POST**
  с `application/x-www-form-urlencoded` (поля `AUTH_ID`, `REFRESH_ID`,
  `DOMAIN`, `member_id`, `PLACEMENT`, `PLACEMENT_OPTIONS`).
- Наш nginx (`frontend/nginx.conf`) перехватывает 405 на POST через
  `error_page 405 =200 $uri;` и всё равно отдаёт `index.html`.
  Тело POST мы игнорируем — оно нам не нужно.
- Дальше React SPA загружается как обычно и стучится в `/api/*`,
  которые Caddy проксирует на Fastify backend (тот ходит в amoCRM).

Если в будущем понадобится REST API Bitrix24 (например, реальные
аватарки сотрудников из B24, сделки B24 и т.п.) — нужно будет:
1. Завести scope в карточке локального приложения.
2. Добавить отдельный модуль `backend/src/modules/bitrix24/` с
   обработкой `AUTH_ID` / `REFRESH_ID` (refresh раз в час).
3. Принимать POST от Bitrix24 в отдельном endpoint, а не игнорировать
   его в nginx.

---

## Траблшутинг

**В iframe пусто / `refused to display in a frame`**
→ Не задеплоен новый `nginx.conf`. Проверь, что в ответе фронта есть
заголовок:
```
Content-Security-Policy: frame-ancestors 'self' https://melabs.bitrix24.ru
```
и **нет** заголовка `X-Frame-Options: DENY/SAMEORIGIN`.

**405 Method Not Allowed при первом открытии**
→ В `nginx.conf` нет директивы `error_page 405 =200 $uri;` — пересобери
образ фронта (`docker compose build frontend && docker compose up -d frontend`).

**API падает на CORS**
→ Frontend и backend должны жить за одним доменом
(`account.mskmegafon.ru`) через Caddy. Не открывай SPA с другого
хоста — iframe внутри B24 это same-origin не починит.

**Хочу второй портал Bitrix24**
→ Добавь его домен в `frame-ancestors` в `frontend/nginx.conf` через
пробел и пересобери фронт.
