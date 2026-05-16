'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/app-shell';
import {
  ApiError,
  createClient,
  fetchUsers,
  type ClientPayload,
  type UserRow
} from '../../../lib/api';

export default function NewClientPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<ClientPayload>({
    type: 'company',
    status: 'active',
    name: '',
    source: 'manual'
  });
  const [users, setUsers] = useState<UserRow[]>([]);
  const [firstContactType, setFirstContactType] = useState<'phone' | 'email' | 'telegram'>('phone');
  const [firstContactValue, setFirstContactValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof ClientPayload, value: string) {
    setPayload((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const client = await createClient({
        ...payload,
        responsibleUserId: payload.responsibleUserId || undefined,
        contacts: firstContactValue
          ? [
              {
                contactType: firstContactType,
                value: firstContactValue,
                isPrimary: true
              }
            ]
          : undefined
      });
      router.replace(`/clients/${client.id}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setError('Недостаточно прав для создания клиента');
      } else {
        setError('Не удалось создать клиента');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="content-band">
        <section className="table-surface form-surface">
          <div className="table-header">
            <div>
              <h2>Новый клиент</h2>
              <span>Основные данные и первый контакт</span>
            </div>
          </div>

          <form className="entity-form" onSubmit={handleSubmit}>
            {error ? <p className="form-error">{error}</p> : null}

            <div className="form-grid">
              <label>
                Тип
                <select
                  value={payload.type}
                  onChange={(event) =>
                    updateField('type', event.target.value as ClientPayload['type'])
                  }
                >
                  <option value="company">Компания</option>
                  <option value="individual">Физлицо</option>
                </select>
              </label>
              <label>
                Статус
                <select
                  value={payload.status}
                  onChange={(event) =>
                    updateField('status', event.target.value as NonNullable<ClientPayload['status']>)
                  }
                >
                  <option value="active">Активный</option>
                  <option value="inactive">Неактивный</option>
                  <option value="archived">Архив</option>
                </select>
              </label>
              <label className="wide-field">
                Название / ФИО
                <input
                  required
                  value={payload.name}
                  onChange={(event) => updateField('name', event.target.value)}
                />
              </label>
              <label>
                ИНН
                <input value={payload.inn ?? ''} onChange={(event) => updateField('inn', event.target.value)} />
              </label>
              <label>
                КПП
                <input value={payload.kpp ?? ''} onChange={(event) => updateField('kpp', event.target.value)} />
              </label>
              <label>
                ОГРН
                <input value={payload.ogrn ?? ''} onChange={(event) => updateField('ogrn', event.target.value)} />
              </label>
              <label>
                Город
                <input value={payload.city ?? ''} onChange={(event) => updateField('city', event.target.value)} />
              </label>
              <label>
                Источник
                <input value={payload.source ?? ''} onChange={(event) => updateField('source', event.target.value)} />
              </label>
              {users.length > 0 ? (
                <label>
                  Ответственный
                  <select
                    value={payload.responsibleUserId ?? ''}
                    onChange={(event) => updateField('responsibleUserId', event.target.value)}
                  >
                    <option value="">Назначить автоматически</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="wide-field">
                Юридический адрес
                <input
                  value={payload.legalAddress ?? ''}
                  onChange={(event) => updateField('legalAddress', event.target.value)}
                />
              </label>
              <label className="wide-field">
                Фактический адрес
                <input
                  value={payload.actualAddress ?? ''}
                  onChange={(event) => updateField('actualAddress', event.target.value)}
                />
              </label>
              <label>
                Первый контакт
                <select
                  value={firstContactType}
                  onChange={(event) =>
                    setFirstContactType(event.target.value as 'phone' | 'email' | 'telegram')
                  }
                >
                  <option value="phone">Телефон</option>
                  <option value="email">Email</option>
                  <option value="telegram">Telegram</option>
                </select>
              </label>
              <label>
                Значение контакта
                <input value={firstContactValue} onChange={(event) => setFirstContactValue(event.target.value)} />
              </label>
              <label className="wide-field">
                Комментарий
                <textarea
                  value={payload.comment ?? ''}
                  onChange={(event) => updateField('comment', event.target.value)}
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Создание' : 'Создать клиента'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
