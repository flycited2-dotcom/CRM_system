import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_ACCOUNT = 10;
const MAX_ATTEMPTS_PER_IP = 60;
const MAX_TRACKED_KEYS = 10_000;

/**
 * Slows down password guessing on the login endpoint.
 * Counts attempts per client address and per address+email inside a sliding window.
 * State is in process memory: enough for a single API instance, and a restart
 * only resets the counters.
 */
@Injectable()
export class LoginThrottleGuard implements CanActivate {
  private readonly attempts = new Map<string, number[]>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = request.ip ?? 'unknown';
    const body = request.body as { email?: unknown } | undefined;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const now = Date.now();

    const ipAllowed = this.register(`ip:${ip}`, MAX_ATTEMPTS_PER_IP, now);
    const accountAllowed = this.register(`acct:${ip}:${email}`, MAX_ATTEMPTS_PER_ACCOUNT, now);

    if (!ipAllowed || !accountAllowed) {
      throw new HttpException(
        'Too many login attempts. Try again in 15 minutes',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    return true;
  }

  private register(key: string, limit: number, now: number): boolean {
    const recent = (this.attempts.get(key) ?? []).filter((time) => time > now - WINDOW_MS);

    if (recent.length >= limit) {
      this.attempts.set(key, recent);
      return false;
    }

    recent.push(now);
    this.attempts.set(key, recent);

    if (this.attempts.size > MAX_TRACKED_KEYS) {
      this.prune(now);
    }

    return true;
  }

  private prune(now: number) {
    for (const [key, times] of this.attempts) {
      if (times.every((time) => time <= now - WINDOW_MS)) {
        this.attempts.delete(key);
      }
    }
  }
}
