import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuthResponseDto } from '@/modules/auth/dtos/auth-response.dto';
import { ConfirmLoginDto } from '@/modules/auth/dtos/confirm-login.dto';
import { LoginConfirmationPendingDto } from '@/modules/auth/dtos/login-confirmation-pending.dto';
import { LoginDto } from '@/modules/auth/dtos/login.dto';
import { RegisterDto } from '@/modules/auth/dtos/register.dto';
import { ResendLoginOtpDto } from '@/modules/auth/dtos/resend-login-otp.dto';
import { AuthService } from '@/modules/auth/services/auth.service';

const LOGIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Invalid email or password' })
  register(
    @Body() dto: RegisterDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthResponseDto> {
    return this.authService.register(dto, request);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: HttpStatus.OK, type: AuthResponseDto })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    description: 'Email confirmation required to complete login',
    type: LoginConfirmationPendingDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponseDto | LoginConfirmationPendingDto> {
    const result = await this.authService.login(dto, request);

    if (result.status === 'CONFIRMATION_REQUIRED') {
      reply.status(HttpStatus.ACCEPTED);
    }

    return result.body;
  }

  @Post('login/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOGIN_THROTTLE)
  @ApiOperation({ summary: 'Confirm a pending login with an OTP code' })
  @ApiResponse({ status: HttpStatus.OK, type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or already-used confirmation code',
  })
  confirmLogin(
    @Body() dto: ConfirmLoginDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthResponseDto> {
    return this.authService.confirmLogin(dto, request);
  }

  @Post('login/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resend the OTP code for a pending login' })
  @ApiResponse({ status: HttpStatus.OK, type: LoginConfirmationPendingDto })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired login attempt',
  })
  @ApiTooManyRequestsResponse({ description: 'Resend cooldown not elapsed' })
  resendLoginOtp(
    @Body() dto: ResendLoginOtpDto,
    @Req() request: FastifyRequest,
  ): Promise<LoginConfirmationPendingDto> {
    return this.authService.resendLoginOtp(dto, request);
  }
}
