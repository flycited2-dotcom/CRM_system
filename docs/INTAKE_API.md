# Вход для внешних систем

Один механизм для всех источников: сайты, парсеры, боты, приложения. Каждая система получает свой ключ и передаёт данные по HTTPS. Ключ выдаётся в CRM в разделе **Интеграции** и показывается один раз.

Базовый адрес: `https://crm.oasis.com.ru/api`

## Авторизация

Ключ передаётся одним из заголовков:

- `X-Integration-Key: crm_…`
- `X-Site-Token: crm_…` — имя из исходной спецификации webhook сайтов
- `Authorization: Bearer crm_…`

Неверный или отключённый ключ — ответ `401`. Отключить систему или выпустить ей новый ключ можно в разделе **Интеграции**, остальные системы это не затронет.

Ограничения: 300 запросов в минуту на ключ; 30 запросов с неверным ключом в минуту с одного адреса.

## Заявка (лид)

`POST /intake/leads` — также доступно как `POST /webhooks/site-leads`.

```json
{
  "externalId": "form-2026-000123",
  "site": "splihub.ru",
  "pageUrl": "https://splihub.ru/catalog/item",
  "name": "Иван",
  "phone": "+79780000000",
  "email": "client@example.com",
  "telegram": "@ivan",
  "message": "Нужен кондиционер",
  "productInterest": "MDV 09",
  "city": "Симферополь",
  "utm": { "source": "yandex", "medium": "cpc", "campaign": "split" }
}
```

Нужно хотя бы одно из полей: `phone`, `email`, `telegram`, `name`, `message`. Неизвестные поля игнорируются.

Ответ:

```json
{ "success": true, "leadId": "uuid", "created": true, "duplicateOfId": null }
```

- **Повторная доставка.** Если передан `externalId`, повтор того же запроса вернёт прежний `leadId` и `"created": false` — второй лид не создаётся. Передавайте `externalId` всегда, когда у источника есть свой номер заявки.
- **Дубли.** Если раньше уже был лид с тем же телефоном или почтой, новый создаётся, а в `duplicateOfId` возвращается идентификатор прежнего. Телефоны сравниваются в едином виде: `8 (978) 000-00-00` и `+7 978 000 00 00` считаются одним номером.
- **Источник.** В поле «Источник» лида записывается код интеграции.

Пример:

```bash
curl -X POST https://crm.oasis.com.ru/api/intake/leads \
  -H "X-Integration-Key: $CRM_INTEGRATION_KEY" \
  -H "Content-Type: application/json" \
  -d '{"externalId":"test-1","name":"Проверка","phone":"+79780000000","message":"Тестовая заявка"}'
```

## Тендеры

`POST /intake/tenders`, до 1000 тендеров в запросе, тело до 5 МБ.

```json
{ "items": [ { "title": "…", "source": "eis-zakupki", "tender_number": "…" } ] }
```

Принимается формат выгрузки парсера тендеров (`exports/latest.json`, `exports/new_tenders.json`) без преобразований. Обязательны `title` и одно из `tender_number` или `url`.

| Поле выгрузки | Поле в CRM |
|---|---|
| `title` | Название |
| `source` + `tender_number` (или `url`) | ключ тендера, по нему ищется уже существующий |
| `official_number`, иначе `platform_number`, иначе `tender_number` | Номер |
| `official_source`, иначе `source` | Площадка |
| `official_url`, иначе `platform_url`, иначе `url` | Ссылка на закупку |
| `customer` | Заказчик |
| `region` | Регион |
| `price` | НМЦК |
| `deadline` | Окончание подачи |
| `published_at` | Дата публикации |
| `procurement_law`, `category` | Закон, категория |
| `review_priority` (`hot` / `review` / `wide`) | Приоритет |
| `documents_url` | Ссылка на документы |
| `include_reason`, `matched_terms`, `match_confidence` | блок «Почему отобран» |

Даты без часового пояса (`2026-11-10T23:59:00`) считаются московским временем; пояс задаётся переменной `INTAKE_DEFAULT_UTC_OFFSET`.

Ответ:

```json
{ "success": true, "received": 234, "created": 230, "updated": 3, "skipped": 1, "errors": [] }
```

Правила:

- Новый тендер создаётся в статусе «Найден» без ответственного.
- Существующий обновляется только в полях источника. Статус, ответственный, комментарий, маржа, требования и результат, заданные в CRM, не меняются. Пустое значение в выгрузке не затирает заполненное.
- Тот же тендер, пришедший через другой агрегатор, распознаётся по официальному номеру закупки.
- Тендер, удалённый в CRM, повторно не появляется.
- Отправлять один и тот же файл повторно безопасно.

### Парсер тендеров

Скрипт `integrations/tender-parser/push_tenders_to_crm.py` отправляет файл выгрузки пачками по 200:

```bash
python integrations/tender-parser/push_tenders_to_crm.py "C:\Users\TLT-1\Documents\GitHub\tender-parser\exports\latest.json" --key-file "C:\Users\TLT-1\.crm\tender-parser.key"
```

Ключ берётся из файла `--key-file` или переменной `CRM_INTEGRATION_KEY`. Проверка без отправки — флаг `--dry-run`.

## Журнал

Каждая передача записывается в журнал интеграции: операция, результат, количество. Он виден в разделе **Интеграции**, кнопка «Журнал». Контактные данные заявок в журнал не копируются.
