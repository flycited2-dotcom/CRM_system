// Передача листа «Тендеры» в CRM.
//
// Третий файл проекта Apps Script таблицы «Учёт заявок» — рядом с основным
// (google-apps-script.gs) и telegram-reminders.gs. Берёт из основного файла
// getSheet() и readRecords().
//
// Раз в 5 минут читает лист и, если в нём что-то изменилось, отправляет все
// строки в CRM. CRM сама находит уже известные закупки по номеру и меняет в них
// только то, что изменилось в таблице.
//
// Подключение:
//   1. «Настройки проекта» → «Свойства скрипта» → CRM_KEY = ключ подключения
//      «Учёт заявок по тендерам» из раздела CRM «Интеграции».
//   2. Выполнить функцию crmSetup — она отправит таблицу и включит расписание.
// Отправить прямо сейчас — crmSyncNow, отключить — crmStop.

const CRM_URL = 'https://crm.oasis.com.ru/api/intake/tenders';
const CRM_SOURCE = 'tender-tracker';
const CRM_EVERY_MINUTES = 5;

// Статус таблицы → этап воронки CRM.
const CRM_STATUS = {
  'Новый': 'analysis',
  'В работе': 'product_check',
  'Подано': 'submitted',
  'Торги': 'awaiting_result',
  'Выиграли': 'won',
  'Проиграли': 'lost',
  'Не состоялся': 'not_held',
  'Опоздали': 'missed',
  'Отказ': 'declined'
};

// Строка таблицы → тендер в формате CRM. Пустые поля не отправляются:
// CRM не затирает ими то, что уже заполнено.
function crmItem(t) {
  const item = {
    source: CRM_SOURCE,
    external_id: t.id,
    title: t.subject || t.customer || ('Закупка ' + (t.number || t.id)),
    tender_number: t.number,
    url: t.url,
    customer: t.customer,
    platform: t.etp,
    procedure_type: t.type,
    price: t.nmck,
    deadline: t.deadline,
    auction_date: t.auctionDate,
    taken_at: t.takenDate,
    work_status: CRM_STATUS[t.status],
    comment: t.comment
  };
  Object.keys(item).forEach(k => { if (item[k] === '' || item[k] == null) delete item[k]; });
  return item;
}

// Запускается по расписанию: отправляет таблицу, только если она изменилась.
function crmSync() {
  crmSend(false);
}

// Отправить, даже если изменений нет.
function crmSyncNow() {
  return crmSend(true);
}

function crmSend(force) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('CRM_KEY');
  if (!key) throw new Error('Не задан CRM_KEY в свойствах скрипта');

  const items = readRecords(getSheet()).map(crmItem);
  if (!items.length) return 'Таблица пуста';

  const payload = JSON.stringify({ items });
  const hash = Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload, Utilities.Charset.UTF_8));
  if (!force && props.getProperty('CRM_LAST_HASH') === hash) return 'Изменений нет';

  const res = UrlFetchApp.fetch(CRM_URL, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: { 'X-Integration-Key': key },
    payload: payload,
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  const body = res.getContentText().slice(0, 500);
  // Ошибка не запоминается как отправленное: следующий запуск повторит передачу.
  if (code < 200 || code >= 300) throw new Error('CRM ответила ' + code + ': ' + body);

  props.setProperty('CRM_LAST_HASH', hash);
  const r = JSON.parse(res.getContentText());
  const msg = 'Отправлено ' + items.length + ': создано ' + r.created + ', обновлено ' + r.updated +
    ', без изменений ' + r.skipped + ', отклонено ' + (r.errors || []).length;
  Logger.log(msg);
  if ((r.errors || []).length) Logger.log(JSON.stringify(r.errors.slice(0, 10)));
  return msg;
}

// Включить передачу: первая отправка и расписание.
function crmSetup() {
  crmStop();
  const msg = crmSyncNow();
  ScriptApp.newTrigger('crmSync').timeBased().everyMinutes(CRM_EVERY_MINUTES).create();
  return msg;
}

// Отключить расписание.
function crmStop() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'crmSync')
    .forEach(t => ScriptApp.deleteTrigger(t));
}
