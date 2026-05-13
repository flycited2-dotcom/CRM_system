'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { logout } from '../lib/api';
import { getStoredUser, type SessionUser } from '../lib/auth';

const navigation = [
  { href: '/dashboard', label: 'Рабочий стол' },
  { href: '/users', label: 'Сотрудники' }
];

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand">
          <span>CRM</span>
          <strong>Control</strong>
        </div>
        <nav className="nav-list">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={pathname === item.href ? 'nav-link nav-link-active' : 'nav-link'}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">Личный контур CRM</span>
            <h1>{pathname === '/users' ? 'Сотрудники' : 'Рабочий стол'}</h1>
          </div>
          <div className="user-block">
            <div>
              <strong>{user?.fullName ?? 'Пользователь'}</strong>
              <span>{user?.roleName ?? 'Роль'}</span>
            </div>
            <button className="secondary-button" type="button" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
