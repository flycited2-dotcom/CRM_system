'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { StatCard } from '../../components/stat-card';
import { fetchMe, fetchTenderSummary, type TenderSummary } from '../../lib/api';
import { clearSession, type SessionUser } from '../../lib/auth';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tenders, setTenders] = useState<TenderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe()
      .then((response) => setUser(response.user))
      .catch(() => {
        clearSession();
        setError('Сессия недействительна');
        router.replace('/login');
      });
    // Not every role may see tenders: the block is simply hidden for those who cannot.
    fetchTenderSummary()
      .then(setTenders)
      .catch(() => setTenders(null));
  }, [router]);

  return (
    <AppShell>
      <div className="content-band">
        <div className="stat-grid">
          <StatCard label="Текущий пользователь" value={user?.fullName ?? '...'} />
          <StatCard label="Роль" value={user?.roleName ?? '...'} tone="good" />
          <StatCard label="Доступов" value={String(user?.permissions.length ?? 0)} />
          <StatCard label="Статус API" value={error ?? 'Доступен'} tone={error ? 'warn' : 'good'} />
        </div>

        {tenders ? (
          <section className="work-surface">
            <div className="table-header">
              <div>
                <h2>Тендеры</h2>
                <span>Что требует внимания сейчас</span>
              </div>
              <Link className="primary-link-button" href="/tenders">
                Открыть тендеры
              </Link>
            </div>
            <div className="stat-grid">
              <StatCard label="Актуальные" value={String(tenders.active)} />
              <StatCard
                label="Срок подачи до 3 дней"
                value={String(tenders.closingSoon)}
                tone={tenders.closingSoon > 0 ? 'warn' : 'neutral'}
              />
              <StatCard
                label="Без ответственного"
                value={String(tenders.unassigned)}
                tone={tenders.unassigned > 0 ? 'warn' : 'neutral'}
              />
              <StatCard label="В работе" value={String(tenders.inWork)} tone="good" />
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
