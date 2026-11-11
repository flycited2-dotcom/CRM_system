'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AppShell } from '../../../components/app-shell';
import { ApiError, createTender, fetchUsers, type UserRow } from '../../../lib/api';

type TenderForm = {
  title: string;
  tenderNumber: string;
  platform: string;
  url: string;
  customerName: string;
  region: string;
  nmck: string;
  submissionDeadline: string;
  auctionDate: string;
  procurementLaw: string;
  responsibleUserId: string;
  comment: string;
};

const emptyForm: TenderForm = {
  title: '',
  tenderNumber: '',
  platform: '',
  url: '',
  customerName: '',
  region: '',
  nmck: '',
  submissionDeadline: '',
  auctionDate: '',
  procurementLaw: '',
  responsibleUserId: '',
  comment: ''
};

// <input type="datetime-local"> gives local time without a zone; the API expects ISO.
function toIso(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

export default function NewTenderPage() {
  const router = useRouter();
  const [form, setForm] = useState<TenderForm>(emptyForm);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  function updateField(field: keyof TenderForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nmck = form.nmck.trim() === '' ? undefined : Number(form.nmck.replace(/\s/g, '').replace(',', '.'));

    if (nmck !== undefined && (!Number.isFinite(nmck) || nmck < 0)) {
      setError('НМЦК должна быть неотрицательным числом');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const tender = await createTender({
        title: form.title.trim(),
        tenderNumber: form.tenderNumber.trim() || undefined,
        platform: form.platform.trim() || undefined,
        url: form.url.trim() || undefined,
        customerName: form.customerName.trim() || undefined,
        region: form.region.trim() || undefined,
        nmck,
        submissionDeadline: toIso(form.submissionDeadline),
        auctionDate: toIso(form.auctionDate),
        procurementLaw: form.procurementLaw.trim() || undefined,
        responsibleUserId: form.responsibleUserId || undefined,
        comment: form.comment.trim() || undefined
      });
      router.replace(`/tenders/${tender.id}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) {
        setError('Недостаточно прав для создания тендера');
      } else if (caught instanceof ApiError && caught.status === 400) {
        setError(`Проверьте поля: ${caught.message}`);
      } else {
        setError('Не удалось создать тендер');
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
              <h2>Новый тендер</h2>
              <span>Закупка, найденная вручную</span>
            </div>
          </div>

          <form className="entity-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <label className="wide-field">
                Название закупки
                <input
                  required
                  minLength={3}
                  value={form.title}
                  onChange={(event) => updateField('title', event.target.value)}
                />
              </label>
              <label>
                Номер
                <input
                  value={form.tenderNumber}
                  onChange={(event) => updateField('tenderNumber', event.target.value)}
                />
              </label>
              <label>
                Площадка
                <input
                  value={form.platform}
                  onChange={(event) => updateField('platform', event.target.value)}
                  placeholder="ЕИС, РТС-тендер, Росэлторг"
                />
              </label>
              <label>
                Закон
                <input
                  value={form.procurementLaw}
                  onChange={(event) => updateField('procurementLaw', event.target.value)}
                  placeholder="44-ФЗ, 223-ФЗ"
                />
              </label>
              <label>
                НМЦК, ₽
                <input
                  inputMode="decimal"
                  value={form.nmck}
                  onChange={(event) => updateField('nmck', event.target.value)}
                />
              </label>
              <label>
                Заказчик
                <input
                  value={form.customerName}
                  onChange={(event) => updateField('customerName', event.target.value)}
                />
              </label>
              <label>
                Регион
                <input value={form.region} onChange={(event) => updateField('region', event.target.value)} />
              </label>
              <label>
                Окончание подачи заявок
                <input
                  type="datetime-local"
                  value={form.submissionDeadline}
                  onChange={(event) => updateField('submissionDeadline', event.target.value)}
                />
              </label>
              <label>
                Дата аукциона
                <input
                  type="datetime-local"
                  value={form.auctionDate}
                  onChange={(event) => updateField('auctionDate', event.target.value)}
                />
              </label>
              {users.length > 0 ? (
                <label>
                  Ответственный
                  <select
                    value={form.responsibleUserId}
                    onChange={(event) => updateField('responsibleUserId', event.target.value)}
                  >
                    <option value="">Не назначен</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="wide-field">
                Ссылка на закупку
                <input
                  type="url"
                  value={form.url}
                  onChange={(event) => updateField('url', event.target.value)}
                  placeholder="https://"
                />
              </label>
              <label className="wide-field">
                Комментарий
                <textarea value={form.comment} onChange={(event) => updateField('comment', event.target.value)} />
              </label>
            </div>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="form-actions">
              <button className="secondary-button" type="button" onClick={() => router.push('/tenders')}>
                Отмена
              </button>
              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Сохранение' : 'Создать тендер'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
