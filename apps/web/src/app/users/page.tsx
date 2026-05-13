'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { ApiError, fetchUsers, type UserRow } from '../../lib/api';

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchUsers()
      .then((rows) => {
        setUsers(rows);
        setError(null);
      })
      .catch((caught) => {
        if (caught instanceof ApiError && caught.status === 403) {
          setError('Недостаточно прав для просмотра сотрудников');
        } else {
          setError('Не удалось загрузить сотрудников');
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="content-band">
        <section className="table-surface">
          <div className="table-header">
            <h2>Пользователи CRM</h2>
            <span>{isLoading ? 'Загрузка' : `${users.length} записей`}</span>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Email</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Последний вход</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.fullName}</td>
                    <td>{user.email}</td>
                    <td>{user.role.name}</td>
                    <td>
                      <span className={user.isActive ? 'status status-good' : 'status status-warn'}>
                        {user.status}
                      </span>
                    </td>
                    <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ru-RU') : '-'}</td>
                  </tr>
                ))}
                {!isLoading && users.length === 0 && !error ? (
                  <tr>
                    <td colSpan={5}>Пользователи не найдены</td>
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
