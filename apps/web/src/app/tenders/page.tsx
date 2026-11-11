'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { StatCard } from '../../components/stat-card';
import {
  ApiError,
  fetchTenderSummary,
  fetchTenders,
  fetchUsers,
  type TenderFilters,
  type TenderRow,
  type TenderSummary,
  type UserRow
} from '../../lib/api';
import {
  deadlineState,
  formatDateTime,
  formatMoney,
  tenderPriorityLabels,
  tenderStatusClass,
  tenderStatusLabels
} from '../../lib/tenders';

const PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

// By default the list hides tenders that were only found and are already closed for bids.
const defaultFilters: TenderFilters = { onlyActual: true };

export default function TendersPage() {
  const [tenders, setTenders] = useState<TenderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<TenderSummary | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filters, setFilters] = useState<TenderFilters>(defaultFilters);
  const [draftFilters, setDraftFilters] = useState<TenderFilters>(defaultFilters);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetchTenders({ ...filters, take: String(pageSize) })
      .then((page) => {
        setTenders(page.items);
        setTotal(page.total);
        setError(null);
      })
      .catch((caught) => {
        setError(
          caught instanceof ApiError && caught.status === 403
            ? 'Недостаточно прав для просмотра тендеров'
            : 'Не удалось загрузить тендеры'
        );
      })
      .finally(() => setIsLoading(false));
  }, [filters, pageSize]);

  useEffect(() => {
    fetchTenderSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
    fetchUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPageSize(PAGE_SIZE);
    setFilters(draftFilters);
  }

  function setDraft(field: keyof TenderFilters, value: string | boolean) {
    setDraftFilters((current) => ({ ...current, [field]: value }));
  }

  return (
    <AppShell>
      <div className="content-band">
        {summary ? (
          <div className="stat-grid">
            <StatCard label="Актуальные" value={String(summary.active)} />
            <StatCard
              label="Срок подачи до 3 дней"
              value={String(summary.closingSoon)}
              tone={summary.closingSoon > 0 ? 'warn' : 'neutral'}
            />
            <StatCard label="Горячие" value={String(summary.hot)} tone="good" />
            <StatCard
              label="Без ответственного"
              value={String(summary.unassigned)}
              tone={summary.unassigned > 0 ? 'warn' : 'neutral'}
            />
          </div>
        ) : null}

        <section className="table-surface">
          <div className="table-header">
            <div>
              <h2>Тендеры</h2>
              <span>{isLoading ? 'Загрузка' : `Показано ${tenders.length} из ${total}`}</span>
            </div>
            <Link className="primary-link-button" href="/tenders/new">
              Добавить тендер
            </Link>
          </div>

          <form className="filter-grid" onSubmit={applyFilters}>
            <label>
              Поиск
              <input
                value={draftFilters.search ?? ''}
                onChange={(event) => setDraft('search', event.target.value)}
                placeholder="Название, номер, заказчик"
              />
            </label>
            <label>
              Статус
              <select
                value={draftFilters.status ?? ''}
                onChange={(event) => setDraft('status', event.target.value)}
              >
                <option value="">Все</option>
                {Object.entries(tenderStatusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Приоритет
              <select
                value={draftFilters.priority ?? ''}
                onChange={(event) => setDraft('priority', event.target.value)}
              >
                <option value="">Все</option>
                {Object.entries(tenderPriorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Срок подачи
              <select
                value={draftFilters.deadline ?? ''}
                onChange={(event) => setDraft('deadline', event.target.value)}
              >
                <option value="">Любой</option>
                <option value="soon">Ближайшие 3 дня</option>
                <option value="expired">Истёк</option>
              </select>
            </label>
            {users.length > 0 ? (
              <label>
                Ответственный
                <select
                  value={draftFilters.responsibleUserId ?? ''}
                  onChange={(event) => setDraft('responsibleUserId', event.target.value)}
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
                checked={Boolean(draftFilters.onlyActual)}
                type="checkbox"
                onChange={(event) => setDraft('onlyActual', event.target.checked)}
              />
              Только актуальные
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
                  <th>Срок подачи</th>
                  <th>Тендер</th>
                  <th>Заказчик</th>
                  <th>НМЦК</th>
                  <th>Приоритет</th>
                  <th>Ответственный</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {tenders.map((tender) => {
                  const deadline = deadlineState(tender);

                  return (
                    <tr key={tender.id}>
                      <td>
                        {formatDateTime(tender.submissionDeadline)}
                        {deadline.label ? <div className="warn-text">{deadline.label}</div> : null}
                      </td>
                      <td>
                        <Link className="table-link" href={`/tenders/${tender.id}`}>
                          {tender.title}
                        </Link>
                        <span className="table-meta">
                          {[tender.tenderNumber, tender.platform, tender.procurementLaw]
                            .filter(Boolean)
                            .join(' · ') || 'Номер не указан'}
                        </span>
                      </td>
                      <td>
                        {tender.customerName ?? '—'}
                        {tender.region ? <span className="table-meta">{tender.region}</span> : null}
                      </td>
                      <td>{formatMoney(tender.nmck)}</td>
                      <td>
                        {tender.priority ? (
                          <span
                            className={
                              tender.priority === 'hot' ? 'status status-hot' : 'status status-muted'
                            }
                          >
                            {tenderPriorityLabels[tender.priority]}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{tender.responsibleUser?.fullName ?? '—'}</td>
                      <td>
                        <span className={tenderStatusClass(tender.status)}>
                          {tenderStatusLabels[tender.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!isLoading && tenders.length === 0 && !error ? (
                  <tr>
                    <td colSpan={7}>Тендеры не найдены</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {tenders.length < total ? (
            <div className="pager">
              <span>
                Показано {tenders.length} из {total}
              </span>
              {pageSize < MAX_PAGE_SIZE ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setPageSize((size) => Math.min(size + PAGE_SIZE, MAX_PAGE_SIZE))}
                >
                  Показать ещё
                </button>
              ) : (
                <span>Уточните фильтры, чтобы увидеть остальные</span>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
