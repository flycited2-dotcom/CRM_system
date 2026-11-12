'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { logout } from '../lib/api';
import { getStoredUser, type SessionUser } from '../lib/auth';

type NavigationItem = {
  href: string;
  label: string;
  title: string;
  // Permission that makes the section visible; the owner sees everything.
  permission?: string;
};

const navigation: NavigationItem[] = [
  { href: '/dashboard', label: 'Рабочий стол', title: 'Рабочий стол' },
  { href: '/clients', label: 'Клиенты', title: 'Клиенты', permission: 'clients.view' },
  { href: '/leads', label: 'Лиды', title: 'Лиды', permission: 'leads.view' },
  { href: '/tenders', label: 'Тендеры', title: 'Тендеры', permission: 'tenders.view' },
  { href: '/users', label: 'Сотрудники', title: 'Сотрудники', permission: 'users.view' },
  {
    href: '/settings/integrations',
    label: 'Интеграции',
    title: 'Интеграции',
    permission: 'settings.manage'
  }
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

  const activeItem = navigation.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`)
  );
  const pageTitle = activeItem?.title ?? 'Рабочий стол';
  // Until the stored user is read, show every section: hiding is a convenience,
  // access itself is enforced by the API.
  const visibleNavigation = navigation.filter(
    (item) =>
      !item.permission ||
      !user ||
      user.role === 'owner' ||
      user.permissions.includes(item.permission)
  );

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <div className="brand">
          <span>CRM</span>
          <strong>Control</strong>
        </div>
        <nav className="nav-list">
          {visibleNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item === activeItem ? 'nav-link nav-link-active' : 'nav-link'}
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
            <h1>{pageTitle}</h1>
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
