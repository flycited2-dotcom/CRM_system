import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type { RequestContext } from '../common/types/request-context';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LogoutDto, RefreshDto } from './dto/refresh.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.authService.login(dto, this.getRequestContext(request));
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() request: Request) {
    return this.authService.refresh(dto, this.getRequestContext(request));
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogoutDto,
    @Req() request: Request
  ) {
    return this.authService.logout(user, dto.refreshToken, this.getRequestContext(request));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  private getRequestContext(request: Request): RequestContext {
    return {
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    };
  }
}
