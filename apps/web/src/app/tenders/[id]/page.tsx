'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../../components/app-shell';
import {
  ApiError,
  changeTenderStatus,
  fetchTender,
  fetchTenderHistory,
  fetchUsers,
  updateTender,
  type TenderHistoryItem,
  type TenderRow,
  type TenderStatus,
  type UserRow
} from '../../../lib/api';
import {
  deadlineState,
  formatDateTime,
  formatMoney,
  tenderPriorityLabels,
  tenderStatusLabels
} from '../../../lib/tenders';

const tabs = [
  ['overview', 'Общее'],
  ['work', 'Работа'],
  ['history', 'История']
] as const;

type TabKey = (typeof tabs)[number][0];

type WorkForm = {
  responsibleUserId: string;
  margin: string;
  requirements: string;
  comment: string;
  result: string;
};

const historyLabels: Record<string, string> = {
  'tender.import': 'Получен из внешней системы',
  'tender.create': 'Создан вручную',
  'tender.update': 'Изменён',
  'tender.status': 'Смена статуса',
  'tender.delete': 'Удалён'
};

function toWorkForm(tender: TenderRow): WorkForm {
  return {
    responsibleUserId: tender.responsibleUserId ?? '',
    margin: tender.margin ?? '',
    requirements: tender.requirements ?? '',
    comment: tender.comment ?? '',
    result: tender.result ?? ''
  };
}

function historyDetail(item: TenderHistoryItem) {
  if (item.action !== 'tender.status') {
    return null;
  }

  const from = (item.oldValueJson as { status?: TenderStatus } | null)?.status;
  const to = (item.newValueJson as { status?: TenderStatus } | null)?.status;

  return from && to ? `${tenderStatusLabels[from]} → ${tenderStatusLabels[to]}` : null;
}

export default function TenderPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [tender, setTender] = useState<TenderRow | null>(null);
  const [history, setHistory] = useState<TenderHistoryItem[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [form, setForm] = useState<WorkForm | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [loaded, loadedHistory] = await Promise.all([
        fetchTender(params.id),
        fetchTenderHistory(params.id)
      ]);
      setTender(loaded);
      setForm(toWorkForm(loaded));
      setHistory(loadedHistory);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 404
          ? 'Тендер не найден'
          : 'Не удалось загрузить тендер'
      );
    }
  }, [params.id]);

  useEffect(() => {
    void load();
    fetchUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [load]);

  async function handleStatusChange(status: TenderStatus) {
    if (!tender || status === tender.status) {
      return;
    }

    setNotice(null);

    try {
      await changeTenderStatus(tender.id, status);
      await load();
      setNotice(`Статус: ${tenderStatusLabels[status]}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сменить статус');
    }
  }

  async function saveWork(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!tender || !form) {
      return;
    }

    const margin = form.margin.trim() === '' ? undefined : Number(form.margin.replace(',', '.'));

    if (margin !== undefined && !Number.isFinite(margin)) {
      setError('Маржа должна быть числом');
      return;
    }

    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      await updateTender(tender.id, {
        responsibleUserId: form.responsibleUserId || null,
        margin,
        requirements: form.requirements,
        comment: form.comment,
        result: form.result
      });
      await load();
      setNotice('Изменения сохранены');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не удалось сохранить изменения');
    } finally {
      setIsSaving(false);
    }
  }

  const deadline = tender ? deadlineState(tender) : null;
  const sourceUrl = tender?.payloadJson?.sourceUrl;

  return (
    <AppShell>
      <div className="content-band">
        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="form-success">{notice}</p> : null}
        {!tender || !form ? (
          <section className="table-surface">
            <div className="table-header">
              <h2>{error ? 'Тендер недоступен' : 'Загрузка тендера'}</h2>
            </div>
          </section>
        ) : (
          <section className="client-card">
            <div className="client-card-header">
              <div>
                <span className="eyebrow">{tenderStatusLabels[tender.status]}</span>
                <h2>{tender.title}</h2>
                <p>
                  {[tender.tenderNumber, tender.platform, tender.procurementLaw]
                    .filter(Boolean)
                    .join(' · ') || 'Номер не указан'}
                </p>
                <p>
                  Срок подачи: {formatDateTime(tender.submissionDeadline)}
                  {deadline?.label ? <span className="warn-text"> · {deadline.label}</span> : null}
                </p>
              </div>
              <button className="secondary-button" type="button" onClick={() => router.push('/tenders')}>
                К списку
              </button>
            </div>

            <div className="tabs">
              {tabs.map(([key, label]) => (
                <button
                  key={key}
                  className={activeTab === key ? 'tab tab-active' : 'tab'}
                  type="button"
                  onClick={() => setActiveTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {activeTab === 'overview' ? (
              <div className="detail-list">
                <div className="detail-row">
                  <strong>Заказчик</strong>
                  <span>{tender.customerName ?? '—'}</span>
                  <small>{tender.region ?? 'Регион не указан'}</small>
                </div>
                <div className="detail-row">
                  <strong>НМЦК</strong>
                  <span>{formatMoney(tender.nmck)}</span>
                </div>
                <div className="detail-row">
                  <strong>Даты</strong>
                  <span>Опубликован: {formatDateTime(tender.publishDate)}</span>
                  <span>Окончание подачи: {formatDateTime(tender.submissionDeadline)}</span>
                  <span>Аукцион: {formatDateTime(tender.auctionDate)}</span>
                </div>
                <div className="detail-row">
                  <strong>Категория и приоритет</strong>
                  <span>{tender.category ?? '—'}</span>
                  <small>
                    {tender.priority ? tenderPriorityLabels[tender.priority] : 'Приоритет не задан'}
                    {tender.payloadJson?.matchConfidence
                      ? ` · совпадение: ${tender.payloadJson.matchConfidence}`
                      : ''}
                  </small>
                </div>
                {tender.payloadJson?.includeReason ? (
                  <div className="detail-row">
                    <strong>Почему отобран</strong>
                    <span>{tender.payloadJson.includeReason}</span>
                    {tender.payloadJson.matchedTerms?.length ? (
                      <small>{tender.payloadJson.matchedTerms.join(', ')}</small>
                    ) : null}
                  </div>
                ) : null}
                <div className="detail-row">
                  <strong>Ссылки</strong>
                  {tender.url ? (
                    <a className="table-link" href={tender.url} rel="noopener noreferrer" target="_blank">
                      Карточка закупки
                    </a>
                  ) : (
                    <span>Ссылка на закупку не указана</span>
                  )}
                  {tender.documentsUrl ? (
                    <a
                      className="table-link"
                      href={tender.documentsUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Документы
                    </a>
                  ) : null}
                  {sourceUrl && sourceUrl !== tender.url ? (
                    <a className="table-link" href={sourceUrl} rel="noopener noreferrer" target="_blank">
                      Карточка в агрегаторе
                    </a>
                  ) : null}
                </div>
                <div className="detail-row">
                  <strong>Источник</strong>
                  <span>{tender.source ?? '—'}</span>
                  <small>
                    Впервые получен {formatDateTime(tender.firstSeenAt)}, обновлён{' '}
                    {formatDateTime(tender.lastSeenAt)}
                  </small>
                </div>
              </div>
            ) : null}

            {activeTab === 'work' ? (
              <form className="entity-form" onSubmit={saveWork}>
                <div className="form-grid">
                  <label>
                    Статус
                    <select
                      value={tender.status}
                      onChange={(event) => void handleStatusChange(event.target.value as TenderStatus)}
                    >
                      {Object.entries(tenderStatusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ответственный
                    <select
                      value={form.responsibleUserId}
                      onChange={(event) =>
                        setForm((current) => current && { ...current, responsibleUserId: event.target.value })
                      }
                    >
                      <option value="">Не назначен</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Маржа, ₽
                    <input
                      inputMode="decimal"
                      value={form.margin}
                      onChange={(event) =>
                        setForm((current) => current && { ...current, margin: event.target.value })
                      }
                    />
                  </label>
                  <label className="wide-field">
                    Требования и условия
                    <textarea
                      value={form.requirements}
                      onChange={(event) =>
                        setForm((current) => current && { ...current, requirements: event.target.value })
                      }
                    />
                  </label>
                  <label className="wide-field">
                    Комментарий
                    <textarea
                      value={form.comment}
                      onChange={(event) =>
                        setForm((current) => current && { ...current, comment: event.target.value })
                      }
                    />
                  </label>
                  <label className="wide-field">
                    Результат
                    <textarea
                      value={form.result}
                      onChange={(event) =>
                        setForm((current) => current && { ...current, result: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <button className="primary-button" disabled={isSaving} type="submit">
                    {isSaving ? 'Сохранение' : 'Сохранить'}
                  </button>
                </div>
              </form>
            ) : null}

            {activeTab === 'history' ? (
              <div className="detail-list">
                {history.map((item) => (
                  <div className="detail-row" key={item.id}>
                    <strong>{historyLabels[item.action] ?? item.action}</strong>
                    {historyDetail(item) ? <span>{historyDetail(item)}</span> : null}
                    <span>{item.user?.fullName ?? 'Система'}</span>
                    <small>{formatDateTime(item.createdAt)}</small>
                  </div>
                ))}
                {history.length === 0 ? <p className="muted-text">История пока пустая</p> : null}
              </div>
            ) : null}
          </section>
        )}
      </div>
    </AppShell>
  );
}
