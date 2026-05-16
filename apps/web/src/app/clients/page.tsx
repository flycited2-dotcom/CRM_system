'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import {
  ApiError,
  fetchClients,
  fetchUsers,
  type ClientContact,
  type ClientFilters,
  type ClientRow,
  type UserRow
} from '../../lib/api';

const typeLabels = {
  company: 'Компания',
  individual: 'Физлицо'
};

const statusLabels = {
  active: 'Активный',
  inactive: 'Неактивный',
  archived: 'Архив'
};

function primaryContact(contacts: ClientContact[], contactType: ClientContact['contactType']) {
  return (
    contacts.find((contact) => contact.contactType === contactType && contact.isPrimary) ??
    contacts.find((contact) => contact.contactType === contactType)
  );
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filters, setFilters] = useState<ClientFilters>({});
  const [draftFilters, setDraftFilters] = useState<ClientFilters>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetchClients(filters)
      .then((rows) => {
        setClients(rows);
        setError(null);
      })
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 403) {
          setError('Недостаточно прав для просмотра клиентов');
        } else {
          setError('Не удалось загрузить клиентов');
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
              <h2>Клиентская база</h2>
              <span>{isLoading ? 'Загрузка' : `${clients.length} записей`}</span>
            </div>
            <Link className="primary-link-button" href="/clients/new">
              Создать клиента
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
                placeholder="Название, ИНН, телефон, город"
              />
            </label>
            <label>
              Тип
              <select
                value={draftFilters.type ?? ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, type: event.target.value }))
                }
              >
                <option value="">Все</option>
                <option value="company">Компания</option>
                <option value="individual">Физлицо</option>
              </select>
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
                <option value="active">Активный</option>
                <option value="inactive">Неактивный</option>
                <option value="archived">Архив</option>
              </select>
            </label>
            <label>
              Источник
              <input
                value={draftFilters.source ?? ''}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, source: event.target.value }))
                }
                placeholder="site, manual, tender"
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
            <button className="secondary-button filter-button" type="submit">
              Применить
            </button>
          </form>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Название / ФИО</th>
                  <th>Тип</th>
                  <th>Телефон</th>
                  <th>Email</th>
                  <th>Ответственный</th>
                  <th>Статус</th>
                  <th>Источник</th>
                  <th>Город</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => {
                  const phone = primaryContact(client.contacts, 'phone');
                  const email = primaryContact(client.contacts, 'email');

                  return (
                    <tr key={client.id}>
                      <td>
                        <Link className="table-link" href={`/clients/${client.id}`}>
                          {client.name}
                        </Link>
                      </td>
                      <td>{typeLabels[client.type]}</td>
                      <td>{phone?.value ?? '-'}</td>
                      <td>{email?.value ?? '-'}</td>
                      <td>{client.responsibleUser?.fullName ?? '-'}</td>
                      <td>
                        <span
                          className={
                            client.status === 'active'
                              ? 'status status-good'
                              : 'status status-warn'
                          }
                        >
                          {statusLabels[client.status]}
                        </span>
                      </td>
                      <td>{client.source ?? '-'}</td>
                      <td>{client.city ?? '-'}</td>
                    </tr>
                  );
                })}
                {!isLoading && clients.length === 0 && !error ? (
                  <tr>
                    <td colSpan={8}>Клиенты не найдены</td>
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
