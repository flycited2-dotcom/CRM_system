'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/app-shell';
import { ApiError, createLead, fetchUsers, type LeadPayload, type UserRow } from '../../../lib/api';

export default function NewLeadPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<LeadPayload>({
    source: 'manual'
  });
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  function updateField(field: keyof LeadPayload, value: string) {
    setPayload((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const lead = await createLead({
        ...payload,
        responsibleUserId: payload.responsibleUserId || undefined
      });
      router.replace(`/leads/${lead.id}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setError('Недостаточно прав для создания лида');
      } else {
        setError('Не удалось создать лид');
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
              <h2>Новый лид</h2>
              <span>Контакт, источник и первичный интерес</span>
            </div>
          </div>

          <form className="entity-form" onSubmit={handleSubmit}>
            {error ? <p className="form-error">{error}</p> : null}

            <div className="form-grid">
              <label>
                Имя
                <input value={payload.name ?? ''} onChange={(event) => updateField('name', event.target.value)} />
              </label>
              <label>
                Телефон
                <input value={payload.phone ?? ''} onChange={(event) => updateField('phone', event.target.value)} />
              </label>
              <label>
                Email
                <input value={payload.email ?? ''} onChange={(event) => updateField('email', event.target.value)} />
              </label>
              <label>
                Telegram
                <input
                  value={payload.telegram ?? ''}
                  onChange={(event) => updateField('telegram', event.target.value)}
                />
              </label>
              <label>
                Город
                <input value={payload.city ?? ''} onChange={(event) => updateField('city', event.target.value)} />
              </label>
              <label>
                Источник
                <input value={payload.source ?? ''} onChange={(event) => updateField('source', event.target.value)} />
              </label>
              <label>
                Сайт
                <input value={payload.site ?? ''} onChange={(event) => updateField('site', event.target.value)} />
              </label>
              <label className="wide-field">
                URL страницы
                <input value={payload.pageUrl ?? ''} onChange={(event) => updateField('pageUrl', event.target.value)} />
              </label>
              {users.length > 0 ? (
                <label>
                  Ответственный
                  <select
                    value={payload.responsibleUserId ?? ''}
                    onChange={(event) => updateField('responsibleUserId', event.target.value)}
                  >
                    <option value="">Не назначать</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="wide-field">
                Интерес
                <input
                  value={payload.productInterest ?? ''}
                  onChange={(event) => updateField('productInterest', event.target.value)}
                />
              </label>
              <label className="wide-field">
                Сообщение
                <textarea
                  value={payload.message ?? ''}
                  onChange={(event) => updateField('message', event.target.value)}
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Создание' : 'Создать лид'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
