'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../../components/app-shell';
import {
  addClientComment,
  addClientContact,
  ApiError,
  deleteClient,
  fetchClient,
  fetchClientHistory,
  fetchUsers,
  updateClient,
  uploadClientFile,
  type ClientContact,
  type ClientDetail,
  type ClientHistoryItem,
  type ClientPayload,
  type UserRow
} from '../../../lib/api';

const tabs = [
  ['overview', 'Общее'],
  ['contacts', 'Контакты'],
  ['comments', 'Комментарии'],
  ['files', 'Файлы'],
  ['history', 'История'],
  ['deals', 'Сделки'],
  ['tasks', 'Задачи'],
  ['offers', 'КП'],
  ['messages', 'Сообщения']
] as const;

type TabKey = (typeof tabs)[number][0];

const contactLabels = {
  phone: 'Телефон',
  email: 'Email',
  telegram: 'Telegram',
  max: 'MAX',
  whatsapp: 'WhatsApp',
  other: 'Другое'
};

export default function ClientCardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const clientId = params.id;
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [history, setHistory] = useState<ClientHistoryItem[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [edit, setEdit] = useState<Partial<ClientPayload>>({});
  const [contact, setContact] = useState({
    contactType: 'phone' as ClientContact['contactType'],
    value: '',
    isPrimary: true,
    comment: ''
  });
  const [commentText, setCommentText] = useState('');
  const [fileComment, setFileComment] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const loadClient = useCallback(async () => {
    const [clientData, historyData] = await Promise.all([
      fetchClient(clientId),
      fetchClientHistory(clientId)
    ]);
    setClient(clientData);
    setHistory(historyData);
    setEdit({
      type: clientData.type,
      status: clientData.status,
      name: clientData.name,
      inn: clientData.inn ?? '',
      kpp: clientData.kpp ?? '',
      ogrn: clientData.ogrn ?? '',
      legalAddress: clientData.legalAddress ?? '',
      actualAddress: clientData.actualAddress ?? '',
      city: clientData.city ?? '',
      source: clientData.source ?? '',
      responsibleUserId: clientData.responsibleUser?.id ?? '',
      comment: clientData.comment ?? ''
    });
  }, [clientId]);

  useEffect(() => {
    loadClient().catch((caught) => {
      if (caught instanceof ApiError && caught.status === 404) {
        setError('Клиент не найден');
      } else if (caught instanceof ApiError && caught.status === 403) {
        setError('Недостаточно прав для просмотра клиента');
      } else {
        setError('Не удалось загрузить клиента');
      }
    });
  }, [loadClient]);

  useEffect(() => {
    fetchUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  function updateField(field: keyof ClientPayload, value: string) {
    setEdit((current) => ({ ...current, [field]: value }));
  }

  async function saveClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const updated = await updateClient(clientId, {
        ...edit,
        responsibleUserId: edit.responsibleUserId || undefined
      });
      setClient(updated);
      await loadClient();
    } catch {
      setError('Не удалось сохранить клиента');
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveClient() {
    if (!window.confirm('Переместить клиента в архив?')) {
      return;
    }

    await deleteClient(clientId);
    router.replace('/clients');
  }

  async function submitContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await addClientContact(clientId, {
      contactType: contact.contactType,
      value: contact.value,
      isPrimary: contact.isPrimary,
      comment: contact.comment || undefined
    });
    setContact({ contactType: 'phone', value: '', isPrimary: true, comment: '' });
    await loadClient();
  }

  async function submitComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await addClientComment(clientId, commentText);
    setCommentText('');
    await loadClient();
  }

  async function submitFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError('Выберите файл');
      return;
    }

    await uploadClientFile(clientId, file, fileComment);
    setFile(null);
    setFileComment('');
    await loadClient();
  }

  return (
    <AppShell>
      <div className="content-band">
        {error ? <p className="form-error">{error}</p> : null}
        {!client ? (
          <section className="table-surface">
            <div className="table-header">
              <h2>Загрузка клиента</h2>
            </div>
          </section>
        ) : (
          <section className="client-card">
            <div className="client-card-header">
              <div>
                <span className="eyebrow">{client.type === 'company' ? 'Компания' : 'Физлицо'}</span>
                <h2>{client.name}</h2>
                <p>{client.city ?? 'Город не указан'} · {client.source ?? 'Источник не указан'}</p>
              </div>
              <button className="secondary-button" type="button" onClick={archiveClient}>
                В архив
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
              <form className="entity-form" onSubmit={saveClient}>
                <div className="form-grid">
                  <label>
                    Тип
                    <select
                      value={edit.type ?? 'company'}
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
                      value={edit.status ?? 'active'}
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
                      value={edit.name ?? ''}
                      onChange={(event) => updateField('name', event.target.value)}
                    />
                  </label>
                  <label>
                    ИНН
                    <input value={edit.inn ?? ''} onChange={(event) => updateField('inn', event.target.value)} />
                  </label>
                  <label>
                    КПП
                    <input value={edit.kpp ?? ''} onChange={(event) => updateField('kpp', event.target.value)} />
                  </label>
                  <label>
                    ОГРН
                    <input value={edit.ogrn ?? ''} onChange={(event) => updateField('ogrn', event.target.value)} />
                  </label>
                  <label>
                    Город
                    <input value={edit.city ?? ''} onChange={(event) => updateField('city', event.target.value)} />
                  </label>
                  <label>
                    Источник
                    <input value={edit.source ?? ''} onChange={(event) => updateField('source', event.target.value)} />
                  </label>
                  {users.length > 0 ? (
                    <label>
                      Ответственный
                      <select
                        value={edit.responsibleUserId ?? ''}
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
                      value={edit.legalAddress ?? ''}
                      onChange={(event) => updateField('legalAddress', event.target.value)}
                    />
                  </label>
                  <label className="wide-field">
                    Фактический адрес
                    <input
                      value={edit.actualAddress ?? ''}
                      onChange={(event) => updateField('actualAddress', event.target.value)}
                    />
                  </label>
                  <label className="wide-field">
                    Комментарий
                    <textarea
                      value={edit.comment ?? ''}
                      onChange={(event) => updateField('comment', event.target.value)}
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

            {activeTab === 'contacts' ? (
              <div className="detail-grid">
                <div className="detail-list">
                  {client.contacts.map((item) => (
                    <div className="detail-row" key={item.id}>
                      <strong>{contactLabels[item.contactType]}</strong>
                      <span>{item.value}</span>
                      {item.isPrimary ? <small>Основной</small> : null}
                    </div>
                  ))}
                  {client.contacts.length === 0 ? <p className="muted-text">Контакты не добавлены</p> : null}
                </div>
                <form className="side-form" onSubmit={submitContact}>
                  <label>
                    Тип контакта
                    <select
                      value={contact.contactType}
                      onChange={(event) =>
                        setContact((current) => ({
                          ...current,
                          contactType: event.target.value as ClientContact['contactType']
                        }))
                      }
                    >
                      {Object.entries(contactLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Значение
                    <input
                      required
                      value={contact.value}
                      onChange={(event) =>
                        setContact((current) => ({ ...current, value: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Комментарий
                    <input
                      value={contact.comment}
                      onChange={(event) =>
                        setContact((current) => ({ ...current, comment: event.target.value }))
                      }
                    />
                  </label>
                  <label className="check-row">
                    <input
                      checked={contact.isPrimary}
                      type="checkbox"
                      onChange={(event) =>
                        setContact((current) => ({ ...current, isPrimary: event.target.checked }))
                      }
                    />
                    Основной контакт
                  </label>
                  <button className="primary-button" type="submit">
                    Добавить контакт
                  </button>
                </form>
              </div>
            ) : null}

            {activeTab === 'comments' ? (
              <div className="detail-grid">
                <div className="detail-list">
                  {client.comments.map((item) => (
                    <div className="detail-row" key={item.id}>
                      <strong>{item.user?.fullName ?? 'Пользователь'}</strong>
                      <span>{item.text}</span>
                      <small>{new Date(item.createdAt).toLocaleString('ru-RU')}</small>
                    </div>
                  ))}
                  {client.comments.length === 0 ? <p className="muted-text">Комментариев пока нет</p> : null}
                </div>
                <form className="side-form" onSubmit={submitComment}>
                  <label>
                    Новый комментарий
                    <textarea
                      required
                      value={commentText}
                      onChange={(event) => setCommentText(event.target.value)}
                    />
                  </label>
                  <button className="primary-button" type="submit">
                    Добавить комментарий
                  </button>
                </form>
              </div>
            ) : null}

            {activeTab === 'files' ? (
              <div className="detail-grid">
                <div className="detail-list">
                  {client.files.map((item) => (
                    <div className="detail-row" key={item.id}>
                      <strong>{item.originalName}</strong>
                      <span>{Math.ceil(item.size / 1024)} KB</span>
                      <small>{item.uploadedBy?.fullName ?? 'Пользователь'}</small>
                    </div>
                  ))}
                  {client.files.length === 0 ? <p className="muted-text">Файлы не загружены</p> : null}
                </div>
                <form className="side-form" onSubmit={submitFile}>
                  <label>
                    Файл
                    <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                  </label>
                  <label>
                    Комментарий
                    <input value={fileComment} onChange={(event) => setFileComment(event.target.value)} />
                  </label>
                  <button className="primary-button" type="submit">
                    Загрузить файл
                  </button>
                </form>
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

            {['deals', 'tasks', 'offers', 'messages'].includes(activeTab) ? (
              <div className="empty-linked-panel">
                Связанный раздел будет наполняться после запуска соответствующего модуля.
              </div>
            ) : null}
          </section>
        )}
      </div>
    </AppShell>
  );
}
