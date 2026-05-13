'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../components/app-shell';
import { StatCard } from '../../components/stat-card';
import { fetchMe } from '../../lib/api';
import { clearSession, type SessionUser } from '../../lib/auth';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe()
      .then((response) => setUser(response.user))
      .catch(() => {
        clearSession();
        setError('Сессия недействительна');
        router.replace('/login');
      });
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
        <section className="work-surface">
          <h2>Операционный старт</h2>
          <div className="surface-grid">
            <div>
              <span className="surface-label">Auth</span>
              <strong>JWT, refresh token, logout</strong>
            </div>
            <div>
              <span className="surface-label">RBAC</span>
              <strong>Роли и permissions</strong>
            </div>
            <div>
              <span className="surface-label">Контроль</span>
              <strong>Рабочие сессии и audit log</strong>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
