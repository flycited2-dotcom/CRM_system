import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import type { Integration } from '@prisma/client';
import type { Request } from 'express';
import { IntegrationsService } from './integrations.service';

export type RequestWithIntegration = Request & {
  integration?: Integration;
};

const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 300;
const MAX_FAILURES_PER_WINDOW = 30;

/**
 * Authenticates intake requests by the integration key.
 * Accepts `X-Integration-Key`, `X-Site-Token` (name used in the site webhook spec)
 * or `Authorization: Bearer <key>`.
 */
@Injectable()
export class IntegrationKeyGuard implements CanActivate {
  private readonly requests = new Map<string, number[]>();

  constructor(private readonly integrationsService: IntegrationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithIntegration>();
    const ip = request.ip ?? 'unknown';
    const now = Date.now();

    // Unknown keys are counted per address so the endpoint cannot be used to guess keys.
    if (this.count(`fail:${ip}`, now) >= MAX_FAILURES_PER_WINDOW) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    const key = this.extractKey(request);
    const integration = key ? await this.integrationsService.authenticate(key) : null;

    if (!integration) {
      this.hit(`fail:${ip}`, now);
      throw new UnauthorizedException('Invalid integration key');
    }

    if (this.hit(`ok:${integration.id}`, now) > MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }

    request.integration = integration;

    return true;
  }

  private extractKey(request: Request): string | null {
    const header = request.headers['x-integration-key'] ?? request.headers['x-site-token'];

    if (typeof header === 'string' && header.trim()) {
      return header.trim();
    }

    const authorization = request.headers.authorization;

    if (authorization?.startsWith('Bearer ')) {
      return authorization.slice('Bearer '.length).trim() || null;
    }

    return null;
  }

  private count(key: string, now: number) {
    const recent = (this.requests.get(key) ?? []).filter((time) => time > now - WINDOW_MS);
    this.requests.set(key, recent);

    return recent.length;
  }

  private hit(key: string, now: number) {
    const recent = (this.requests.get(key) ?? []).filter((time) => time > now - WINDOW_MS);
    recent.push(now);
    this.requests.set(key, recent);

    if (this.requests.size > 5000) {
      for (const [storedKey, times] of this.requests) {
        if (times.every((time) => time <= now - WINDOW_MS)) {
          this.requests.delete(storedKey);
        }
      }
    }

    return recent.length;
  }
}
