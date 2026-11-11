'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../../components/app-shell';
import {
  ApiError,
  createIntegration,
  fetchIntegrationLogs,
  fetchIntegrations,
  rotateIntegrationKey,
  updateIntegration,
  type IntegrationLogRow,
  type IntegrationRow,
  type IntegrationType,
  type IntegrationWithKey
} from '../../../lib/api';
import { formatDateTime } from '../../../lib/tenders';

const typeLabels: Record<IntegrationType, string> = {
  site: 'Сайт',
  app: 'Приложение',
  avito: 'Авито',
  vk: 'ВКонтакте',
  telegram: 'Telegram',
  email: 'Почта',
  tender_parser: 'Парсер тендеров',
  parser: 'Парсер',
  agent: 'Агент',
  onec: '1С',
  other: 'Другое'
};

const logStatusLabels: Record<string, string> = {
  success: 'Успешно',
  partial: 'Частично',
  duplicate: 'Повтор',
  error: 'Ошибка'
};

const emptyForm = { name: '', code: '', type: 'site' as IntegrationType, description: '' };

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [issued, setIssued] = useState<IntegrationWithKey | null>(null);
  const [logsFor, setLogsFor] = useState<IntegrationRow | null>(null);
  const [logs, setLogs] = useState<IntegrationLogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      setIntegrations(await fetchIntegrations());
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 403
          ? 'Недостаточно прав для управления интеграциями'
          : 'Не удалось загрузить интеграции'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const created = await createIntegration({
        type: form.type,
        name: form.name.trim(),
        code: form.code.trim().toLowerCase(),
        description: form.description.trim() || undefined
      });
      setIssued(created);
      setForm(emptyForm);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось создать интеграцию');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggle(integration: IntegrationRow) {
    setError(null);

    try {
      await updateIntegration(integration.id, {
        status: integration.status === 'active' ? 'disabled' : 'active'
      });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось изменить статус');
    }
  }

  async function handleRotate(integration: IntegrationRow) {
    if (!window.confirm(`Выпустить новый ключ для «${integration.name}»? Прежний сразу перестанет работать.`)) {
      return;
    }

    setError(null);

    try {
      setIssued(await rotateIntegrationKey(integration.id));
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось выпустить ключ');
    }
  }

  async function handleShowLogs(integration: IntegrationRow) {
    setLogsFor(integration);
    setLogs([]);

    try {
      setLogs(await fetchIntegrationLogs(integration.id));
    } catch {
      setError('Не удалось загрузить журнал');
    }
  }

  async function copyKey() {
    if (!issued) {
      return;
    }

    try {
      await navigator.clipboard.writeText(issued.key);
      setNotice('Ключ скопирован');
    } catch {
      setNotice('Скопируйте ключ вручную');
    }
  }

  return (
    <AppShell>
      <div className="content-band">
        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="form-success">{notice}</p> : null}

        {issued ? (
          <section className="key-box">
            <strong>Ключ для «{issued.name}»</strong>
            <span>
              Сохраните его сейчас: после закрытия этого блока посмотреть ключ будет нельзя, только
              выпустить новый.
            </span>
            <code>{issued.key}</code>
            <div className="row-actions">
              <button className="secondary-button" type="button" onClick={() => void copyKey()}>
                Скопировать
              </button>
              <button className="secondary-button" type="button" onClick={() => setIssued(null)}>
                Я сохранил ключ
              </button>
            </div>
          </section>
        ) : null}

        <section className="table-surface">
          <div className="table-header">
            <div>
              <h2>Источники данных</h2>
              <span>
                {isLoading ? 'Загрузка' : `${integrations.length} подключений`} · у каждой системы свой ключ
              </span>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Тип</th>
                  <th>Код источника</th>
                  <th>Ключ</th>
                  <th>Последняя передача</th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((integration) => (
                  <tr key={integration.id}>
                    <td>
                      {integration.name}
                      {integration.description ? (
                        <span className="table-meta">{integration.description}</span>
                      ) : null}
                    </td>
                    <td>{typeLabels[integration.type]}</td>
                    <td>{integration.code}</td>
                    <td>{integration.keyPrefix}…</td>
                    <td>{integration.lastSyncAt ? formatDateTime(integration.lastSyncAt) : 'Ещё не было'}</td>
                    <td>
                      <span className={integration.status === 'active' ? 'status status-good' : 'status status-warn'}>
                        {integration.status === 'active' ? 'Включена' : 'Отключена'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => void handleShowLogs(integration)}
                        >
                          Журнал
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => void handleToggle(integration)}
                        >
                          {integration.status === 'active' ? 'Отключить' : 'Включить'}
                        </button>
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => void handleRotate(integration)}
                        >
                          Новый ключ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && integrations.length === 0 && !error ? (
                  <tr>
                    <td colSpan={7}>Пока ничего не подключено</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {logsFor ? (
            <>
              <h3 className="section-title">Журнал: {logsFor.name}</h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Когда</th>
                      <th>Операция</th>
                      <th>Результат</th>
                      <th>Подробности</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDateTime(log.createdAt)}</td>
                        <td>{log.operation}</td>
                        <td>
                          <span className={log.status === 'error' ? 'status status-warn' : 'status status-good'}>
                            {logStatusLabels[log.status] ?? log.status}
                          </span>
                        </td>
                        <td>{log.errorMessage ?? (log.responseJson ? JSON.stringify(log.responseJson) : '—')}</td>
                      </tr>
                    ))}
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={4}>Записей пока нет</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>

        <section className="table-surface form-surface">
          <div className="table-header">
            <div>
              <h2>Подключить систему</h2>
              <span>Сайт, парсер, бот или другой источник заявок и тендеров</span>
            </div>
          </div>

          <form className="entity-form" onSubmit={handleCreate}>
            <div className="form-grid">
              <label>
                Название
                <input
                  required
                  minLength={2}
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Сайт SplitHub"
                />
              </label>
              <label>
                Код источника
                <input
                  required
                  pattern="[a-z0-9][a-z0-9._\-]{1,48}"
                  title="Латинские строчные буквы, цифры, точка, дефис, подчёркивание"
                  value={form.code}
                  onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                  placeholder="splihub.ru"
                />
              </label>
              <label>
                Тип
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, type: event.target.value as IntegrationType }))
                  }
                >
                  {Object.entries(typeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wide-field">
                Описание
                <input
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
            </div>
            <div className="form-actions">
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Создание' : 'Создать и получить ключ'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
