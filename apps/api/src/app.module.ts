import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { LeadsModule } from './leads/leads.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
import { TendersModule } from './tenders/tenders.module';
import { UsersModule } from './users/users.module';
import { WorkSessionsModule } from './work-sessions/work-sessions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env']
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn = (configService.get<string>('JWT_ACCESS_EXPIRES_IN') ??
          '15m') as StringValue;

        const configuredSecret = configService.get<string>('JWT_ACCESS_SECRET');

        // A missing or short secret in production would let anyone forge tokens,
        // so refuse to start instead of falling back to a value known from the source.
        if (process.env.NODE_ENV === 'production' && (!configuredSecret || configuredSecret.length < 32)) {
          throw new Error('JWT_ACCESS_SECRET must be set to at least 32 characters in production');
        }

        return {
          secret: configuredSecret ?? 'local-access-secret',
          signOptions: { expiresIn }
        };
      }
    }),
    PrismaModule,
    AuditModule,
    WorkSessionsModule,
    AuthModule,
    ClientsModule,
    LeadsModule,
    TendersModule,
    IntegrationsModule,
    UsersModule,
    RolesModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
