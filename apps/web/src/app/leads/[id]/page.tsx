'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../../components/app-shell';
import {
  ApiError,
  assignLead,
  closeLead,
  convertLeadToClient,
  convertLeadToDeal,
  fetchLead,
  fetchLeadHistory,
  fetchUsers,
  updateLead,
  type LeadDetail,
  type LeadHistoryItem,
  type LeadPayload,
  type LeadStatus,
  type UserRow
} from '../../../lib/api';

const statusLabels: Record<LeadStatus, string> = {
  new: 'Новый',
  assigned: 'Назначен',
  in_progress: 'В работе',
  converted: 'Сконвертирован',
  closed: 'Закрыт'
};

const tabs = [
  ['overview', 'Общее'],
  ['actions', 'Обработка'],
  ['history', 'История'],
  ['links', 'Связи']
] as const;

type TabKey = (typeof tabs)[number][0];

export default function LeadCardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const leadId = params.id;
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [history, setHistory] = useState<LeadHistoryItem[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [edit, setEdit] = useState<Partial<LeadPayload>>({});
  const [assignedUserId, setAssignedUserId] = useState('');
  const [closeReason, setCloseReason] = useState('duplicate');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadLead = useCallback(async () => {
    const [leadData, historyData] = await Promise.all([
      fetchLead(leadId),
      fetchLeadHistory(leadId)
    ]);
    setLead(leadData);
    setHistory(historyData);
    setAssignedUserId(leadData.responsibleUser?.id ?? '');
    setEdit({
      source: leadData.source ?? '',
      site: leadData.site ?? '',
      pageUrl: leadData.pageUrl ?? '',
      name: leadData.name ?? '',
      phone: leadData.phone ?? '',
      email: leadData.email ?? '',
      telegram: leadData.telegram ?? '',
      message: leadData.message ?? '',
      productInterest: leadData.productInterest ?? '',
      city: leadData.city ?? '',
      status: leadData.status
    });
  }, [leadId]);

  useEffect(() => {
    loadLead().catch((caught) => {
      if (caught instanceof ApiError && caught.status === 404) {
        setError('Лид не найден');
      } else if (caught instanceof ApiError && caught.status === 403) {
        setError('Недостаточно прав для просмотра лида');
      } else {
        setError('Не удалось загрузить лид');
      }
    });
  }, [loadLead]);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  function updateField(field: keyof LeadPayload, value: string) {
    setEdit((current) => ({ ...current, [field]: value }));
  }

  async function saveLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setNotice(null);

    try {
      await updateLead(leadId, edit);
      await loadLead();
      setNotice('Лид сохранён');
    } catch {
      setError('Не удалось сохранить лид');
    } finally {
      setIsSaving(false);
    }
  }

  async function submitAssign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!assignedUserId) {
      setError('Выберите ответственного');
      return;
    }

    await assignLead(leadId, assignedUserId);
    await loadLead();
    setNotice('Ответственный назначен');
  }

  async function submitClose(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await closeLead(leadId, closeReason);
    await loadLead();
    setNotice('Лид закрыт');
  }

  async function submitConvertToClient() {
    await convertLeadToClient(leadId);
    await loadLead();
    setNotice('Лид сконвертирован в клиента');
  }

  async function submitConvertToDeal() {
    try {
      await convertLeadToDeal(leadId);
      await loadLead();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setNotice(caught.message);
      } else {
        setNotice('Конвертация в сделку будет доступна после запуска модуля сделок');
      }
    }
  }

  return (
    <AppShell>
      <div className="content-band">
        {error ? <p className="form-error">{error}</p> : null}
        {notice ? <p className="form-success">{notice}</p> : null}
        {!lead ? (
          <section className="table-surface">
            <div className="table-header">
              <h2>Загрузка лида</h2>
            </div>
          </section>
        ) : (
          <section className="client-card">
            <div className="client-card-header">
              <div>
                <span className="eyebrow">{statusLabels[lead.status]}</span>
                <h2>{lead.name ?? lead.phone ?? lead.email ?? 'Лид без имени'}</h2>
                <p>
                  {lead.city ?? 'Город не указан'} · {lead.source ?? 'Источник не указан'}
                </p>
              </div>
              <button className="secondary-button" type="button" onClick={() => router.push('/leads')}>
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
              <form className="entity-form" onSubmit={saveLead}>
                <div className="form-grid">
                  <label>
                    Статус
                    <select
                      value={edit.status ?? 'new'}
                      onChange={(event) => updateField('status', event.target.value as LeadStatus)}
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Имя
                    <input value={edit.name ?? ''} onChange={(event) => updateField('name', event.target.value)} />
                  </label>
                  <label>
                    Телефон
                    <input value={edit.phone ?? ''} onChange={(event) => updateField('phone', event.target.value)} />
                  </label>
                  <label>
                    Email
                    <input value={edit.email ?? ''} onChange={(event) => updateField('email', event.target.value)} />
                  </label>
                  <label>
                    Telegram
                    <input
                      value={edit.telegram ?? ''}
                      onChange={(event) => updateField('telegram', event.target.value)}
                    />
                  </label>
                  <label>
                    Источник
                    <input value={edit.source ?? ''} onChange={(event) => updateField('source', event.target.value)} />
                  </label>
                  <label>
                    Сайт
                    <input value={edit.site ?? ''} onChange={(event) => updateField('site', event.target.value)} />
                  </label>
                  <label>
                    Город
                    <input value={edit.city ?? ''} onChange={(event) => updateField('city', event.target.value)} />
                  </label>
                  <label className="wide-field">
                    URL страницы
                    <input
                      value={edit.pageUrl ?? ''}
                      onChange={(event) => updateField('pageUrl', event.target.value)}
                    />
                  </label>
                  <label className="wide-field">
                    Интерес
                    <input
                      value={edit.productInterest ?? ''}
                      onChange={(event) => updateField('productInterest', event.target.value)}
                    />
                  </label>
                  <label className="wide-field">
                    Сообщение
                    <textarea
                      value={edit.message ?? ''}
                      onChange={(event) => updateField('message', event.target.value)}
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <button className="primary-button" type="submit" disabled={isSaving}>
                    {isSaving ? 'Сохранение' : 'Сохранить'}
                  </button>
                </div>
              </form>
            ) : null}

            {activeTab === 'actions' ? (
              <div className="detail-grid">
                <div className="detail-list">
                  <div className="detail-row">
                    <small>Ответственный</small>
                    <span>{lead.responsibleUser?.fullName ?? 'Не назначен'}</span>
                  </div>
                  <div className="detail-row">
                    <small>Первый ответ</small>
                    <span>
                      {lead.firstResponseAt
                        ? new Date(lead.firstResponseAt).toLocaleString('ru-RU')
                        : 'Не зафиксирован'}
                    </span>
                  </div>
                  <div className="detail-row">
                    <small>Закрытие</small>
                    <span>{lead.closeReason ?? 'Не закрыт'}</span>
                  </div>
                </div>
                <div className="side-stack">
                  <form className="side-form" onSubmit={submitAssign}>
                    <label>
                      Назначить
                      <select value={assignedUserId} onChange={(event) => setAssignedUserId(event.target.value)}>
                        <option value="">Выберите сотрудника</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="primary-button" type="submit">
                      Назначить
                    </button>
                  </form>
                  <button className="primary-button" type="button" onClick={submitConvertToClient}>
                    В клиента
                  </button>
                  <button className="secondary-button" type="button" onClick={submitConvertToDeal}>
                    В сделку
                  </button>
                  <form className="side-form" onSubmit={submitClose}>
                    <label>
                      Причина закрытия
                      <select value={closeReason} onChange={(event) => setCloseReason(event.target.value)}>
                        <option value="duplicate">Дубль</option>
                        <option value="not_target">Нецелевой</option>
                        <option value="spam">Спам</option>
                        <option value="no_response">Нет ответа</option>
                      </select>
                    </label>
                    <button className="secondary-button" type="submit">
                      Закрыть лид
                    </button>
                  </form>
                </div>
              </div>
            ) : null}

            {activeTab === 'history' ? (
              <div className="detail-list">
                {history.map((item) => (
                  <div className="detail-row" key={item.id}>
                    <strong>{item.action}</strong>
                    <span>{item.user?.fullName ?? 'Система'}</span>
                    <small>{new Date(item.createdAt).toLocaleString('ru-RU')}</small>
                  </div>
                ))}
                {history.length === 0 ? <p className="muted-text">История пока пустая</p> : null}
              </div>
            ) : null}

            {activeTab === 'links' ? (
              <div className="detail-list">
                <div className="detail-row">
                  <small>Клиент</small>
                  {lead.client ? (
                    <Link className="table-link" href={`/clients/${lead.client.id}`}>
                      {lead.client.name}
                    </Link>
                  ) : (
                    <span>Клиент ещё не создан</span>
                  )}
                </div>
                <div className="empty-linked-panel">
                  Сделка появится после запуска модуля сделок.
                </div>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </AppShell>
  );
}
