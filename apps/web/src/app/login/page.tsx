'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, login } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@example.com');
  const [password, setPassword] = useState('ChangeMe123!');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError('Не удалось войти в CRM');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-copy">
          <span className="eyebrow">CRM Control</span>
          <h1>Вход в систему</h1>
        </div>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Пароль
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={isLoading}>
            {isLoading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </section>
    </main>
  );
}
