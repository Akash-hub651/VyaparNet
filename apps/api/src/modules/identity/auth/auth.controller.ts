import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  Ip,
  Get,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { Public } from '../../../shared/decorators/public.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import {
  SendOtpSchema,
  VerifyOtpSchema,
  RefreshTokenSchema,
  AdminLoginSchema,
} from '@vyaparnet/types';
import type {
  SendOtpDto,
  VerifyOtpDto,
  RefreshTokenDto,
  AuthTokensResponse,
  AdminLoginDto,
} from '@vyaparnet/types';
import type { JwtPayload } from './token.service';

/**
 * AuthController — authentication endpoints.
 *
 * All auth endpoints are @Public() (no JWT required to authenticate).
 * Logout endpoints require valid JWT.
 *
 * Rate limiting is enforced at service layer (Redis counters).
 * Global @nestjs/throttler rate limit also applied (100 req/min per IP).
 *
 * Authority: VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md Section 2
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/otp/send
   *
   * Send OTP to phone number.
   * Rate limited: 3 per 5min per phone, 50 per 5min per IP.
   */
  @Public()
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  async sendOtp(
    @Body(new ZodValidationPipe(SendOtpSchema)) dto: SendOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ): Promise<{ success: true; data: { message: string; expiresIn: number } }> {
    const result = await this.authService.sendOtp(
      dto,
      ip ?? '0.0.0.0',
      userAgent ?? '',
    );
    return { success: true, data: result };
  }

  /**
   * POST /api/v1/auth/otp/verify
   *
   * Verify OTP and issue JWT token pair.
   * Returns accessToken + refreshToken on success.
   */
  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body(new ZodValidationPipe(VerifyOtpSchema)) dto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ): Promise<{ success: true; data: AuthTokensResponse }> {
    const tokens = await this.authService.verifyOtp(
      dto,
      ip ?? '0.0.0.0',
      userAgent ?? '',
    );
    return { success: true, data: tokens };
  }

  /**
   * POST /api/v1/auth/refresh
   *
   * Rotate refresh token and issue new token pair.
   * Old refresh token is revoked atomically.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ZodValidationPipe(RefreshTokenSchema)) dto: RefreshTokenDto,
    @Ip() ip: string,
  ): Promise<{ success: true; data: AuthTokensResponse }> {
    const tokens = await this.authService.refreshTokens(dto, ip ?? '0.0.0.0');
    return { success: true, data: tokens };
  }

  /**
   * POST /api/v1/auth/login
   *
   * Admin Panel password-based login.
   * Sets admin_token httpOnly cookie.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(AdminLoginSchema)) dto: AdminLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<any> {
    const { tokens, user } = await this.authService.loginAdmin(
      dto,
      ip ?? '0.0.0.0',
      userAgent ?? '',
    );

    // Set httpOnly cookie for the admin panel
    res.cookie('admin_token', tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: tokens.expiresIn * 1000, // maxAge in milliseconds
    });

    return user;
  }

  /**
   * GET /api/v1/auth/me
   *
   * Get current authenticated user details.
   */
  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getMe(@CurrentUser() user: JwtPayload): Promise<any> {
    return {
      id: user.sub,
      role: user.role,
      segment: user.segment,
    };
  }

  /**
   * POST /api/v1/auth/logout
   *
   * Revoke current session.
   * Requires valid JWT.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { refreshToken?: string },
  ): Promise<{ success: true; data: { message: string } }> {
    // Extract session ID from JWT jti or from request context
    await this.authService.logout(user.sub, user.jti, body.refreshToken);

    // Clear admin_token cookie
    res.clearCookie('admin_token', { path: '/' });

    return { success: true, data: { message: 'Logged out successfully.' } };
  }

  /**
   * POST /api/v1/auth/logout-all
   *
   * Revoke all sessions for this user (logout from all devices).
   * Requires valid JWT.
   */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: JwtPayload,
  ): Promise<{ success: true; data: { message: string } }> {
    await this.authService.logoutAll(user.sub, user.jti);
    return { success: true, data: { message: 'Logged out from all devices.' } };
  }
}
