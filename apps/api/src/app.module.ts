import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { StringValue } from 'ms';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RolesModule } from './roles/roles.module';
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

        return {
          secret: configService.get<string>('JWT_ACCESS_SECRET') ?? 'local-access-secret',
          signOptions: { expiresIn }
        };
      }
    }),
    PrismaModule,
    AuditModule,
    WorkSessionsModule,
    AuthModule,
    UsersModule,
    RolesModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
