'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import {
  ApiError,
  fetchLeads,
  fetchUsers,
  type LeadFilters,
  type LeadRow,
  type LeadStatus,
  type UserRow
} from '../../lib/api';

const statusLabels: Record<LeadStatus, string> = {
  new: 'Новый',
  assigned: 'Назначен',
  in_progress: 'В работе',
  converted: 'Сконвертирован',
  closed: 'Закрыт'
};

function contactLabel(lead: LeadRow) {
  return lead.name ?? lead.phone ?? lead.email ?? lead.telegram ?? 'Без контакта';
}

function isOverdue(lead: LeadRow) {
  if (lead.firstResponseAt || !['new', 'assigned'].includes(lead.status)) {
    return false;
  }

  return Date.now() - new Date(lead.receivedAt).getTime() > 15 * 60 * 1000;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filters, setFilters] = useState<LeadFilters>({});
  const [draftFilters, setDraftFilters] = useState<LeadFilters>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetchLeads(filters)
      .then((rows) => {
        setLeads(rows);
        setError(null);
      })
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 403) {
          setError('Недостаточно прав для просмотра лидов');
        } else {
          setError('Не удалось загрузить лиды');
        }
      })
      .finally(() => setIsLoading(false));
  }, [filters]);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters(draftFilters);
  }

  return (
    <AppShell>
      <div className="content-band">
        <section className="table-surface">
          <div className="table-header">
            <div>
              <h2>Входящие лиды</h2>
              <span>{isLoading ? 'Загрузка' : `${leads.length} записей`}</span>
            </div>
            <Link className="primary-link-button" href="/leads/new">
              Создать лид
            </Link>
          </div>

          <form className="filter-grid" onSubmit={applyFilters}>
            <label>
              Поиск
              <input
                value={draftFilters.search ?? ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, search: event.target.value }))
                }
                placeholder="Имя, телефон, email, источник"
              />
            </label>
            <label>
              Статус
              <select
                value={draftFilters.status ?? ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, status: event.target.value }))
                }
              >
                <option value="">Все</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Источник
              <input
                value={draftFilters.source ?? ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, source: event.target.value }))
                }
                placeholder="manual, site, phone"
              />
            </label>
            <label>
              Город
              <input
                value={draftFilters.city ?? ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, city: event.target.value }))
                }
                placeholder="Симферополь"
              />
            </label>
            {users.length > 0 ? (
              <label>
                Ответственный
                <select
                  value={draftFilters.responsibleUserId ?? ''}
                  onChange={(event) =>
                    setDraftFilters((current) => ({
                      ...current,
                      responsibleUserId: event.target.value
                    }))
                  }
                >
                  <option value="">Все</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="check-row filter-check">
              <input
                checked={Boolean(draftFilters.overdue)}
                type="checkbox"
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, overdue: event.target.checked }))
                }
              />
              Просрочены 15 мин
            </label>
            <button className="secondary-button filter-button" type="submit">
              Применить
            </button>
          </form>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Поступил</th>
                  <th>Контакт</th>
                  <th>Связь</th>
                  <th>Источник</th>
                  <th>Город</th>
                  <th>Интерес</th>
                  <th>Ответственный</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>{new Date(lead.receivedAt).toLocaleString('ru-RU')}</td>
                    <td>
                      <Link className="table-link" href={`/leads/${lead.id}`}>
                        {contactLabel(lead)}
                      </Link>
                      {isOverdue(lead) ? <div className="warn-text">15+ минут</div> : null}
                    </td>
                    <td>
                      {[lead.phone, lead.email, lead.telegram].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td>{[lead.source, lead.site].filter(Boolean).join(' / ') || '-'}</td>
                    <td>{lead.city ?? '-'}</td>
                    <td>{lead.productInterest ?? '-'}</td>
                    <td>{lead.responsibleUser?.fullName ?? '-'}</td>
                    <td>
                      <span
                        className={
                          lead.status === 'converted'
                            ? 'status status-good'
                            : lead.status === 'closed'
                              ? 'status status-warn'
                              : 'status'
                        }
                      >
                        {statusLabels[lead.status]}
                      </span>
                    </td>
                  </tr>
                ))}
                {!isLoading && leads.length === 0 && !error ? (
                  <tr>
                    <td colSpan={8}>Лиды не найдены</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
