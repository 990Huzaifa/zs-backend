import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import { OAuth2Client } from 'google-auth-library';
import { Repository } from 'typeorm';
import * as appleSignin from 'apple-signin-auth';
import { ForgotPasswordDto } from '../auth/dto/forgot-password.dto';
import { LoginDto } from '../auth/dto/login.dto';
import { RegisterDto } from '../auth/dto/register.dto';
import { ResendOtpDto } from '../auth/dto/resend-otp.dto';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto';
import { SocialLoginDto } from '../auth/dto/social-login.dto';
import { UserResponseDto } from '../auth/dto/user-response.dto';
import { VerifyEmailDto } from '../auth/dto/verify-email.dto';
import { SocialProfile } from '../auth/types/social-profile.type';
import { PasswordResetTokenType } from '../database/entities/password-reset-token.entity';
import { SocialAuthProvider } from '../database/entities/user-auth-provider.entity';
import { ProfileType, User } from '../database/entities/user.entity';
import { Role } from '../database/entities/role.entity';
import { MailService } from './mail.service';
import { PasswordResetTokenService } from './password-reset-token.service';
import { UserAuthProviderService } from './user-auth-provider.service';
import { UsersService } from './users.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client | null;

  constructor(
    private readonly usersService: UsersService,
    private readonly passwordResetTokenService: PasswordResetTokenService,
    private readonly userAuthProviderService: UserAuthProviderService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
  ) {
    const googleClientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.googleClient = googleClientId
      ? new OAuth2Client(googleClientId)
      : null;
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const role = await this.getDefaultUserRole();
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.usersService.create({
      name: dto.name,
      email,
      password: hashedPassword,
      phone: dto.phone,
      avatar: dto.avatar,
      deviceId: dto.deviceId,
      fcmToken: dto.fcmToken,
      ip: dto.ip,
      appVersion: dto.appVersion,
      profileType: ProfileType.USER,
      role,
    });

    const otp = await this.passwordResetTokenService.createToken(
      user,
      PasswordResetTokenType.EMAIL_VERIFICATION,
    );

    await this.mailService.sendVerifyEmail(user.email!, user.name, otp);

    return {
      message: 'Registration successful. Please verify your email.',
      user: this.toUserResponse(user),
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.findUserByEmailOrFail(dto.email);
    if (user.isEmailVerified) {
      return {
        message: 'Email already verified',
        user: this.toUserResponse(user),
        accessToken: await this.signToken(user),
      };
    }

    const token = await this.passwordResetTokenService.verifyToken(
      user.id,
      dto.otp,
      PasswordResetTokenType.EMAIL_VERIFICATION,
    );
    await this.passwordResetTokenService.markUsed(token);

    const verified = await this.usersService.markEmailVerified(user.id);
    return {
      message: 'Email verified successfully',
      user: this.toUserResponse(verified),
      accessToken: await this.signToken(verified),
    };
  }

  async resendVerification(dto: ResendOtpDto) {
    const user = await this.findUserByEmailOrFail(dto.email);
    if (user.isEmailVerified) {
      return { message: 'Email already verified' };
    }

    const otp = await this.passwordResetTokenService.createToken(
      user,
      PasswordResetTokenType.EMAIL_VERIFICATION,
    );
    await this.mailService.sendVerifyEmail(user.email!, user.name, otp);
    return { message: 'Verification code sent' };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(
      dto.email.toLowerCase().trim(),
    );
    if (!user?.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Please verify your email first');
    }

    await this.usersService.touchLastLogin(user.id);

    return {
      message: 'Login successful',
      user: this.toUserResponse(user),
      accessToken: await this.signToken(user),
    };
  }

  async socialLogin(dto: SocialLoginDto) {
    const profile = await this.verifySocialToken(dto.provider, dto.idToken);

    let user = await this.userAuthProviderService.findUserByProvider(
      dto.provider,
      profile.providerUserId,
    );

    if (!user && profile.email) {
      user = await this.usersService.findByEmail(profile.email.toLowerCase());
      if (user) {
        await this.userAuthProviderService.linkToUser(
          user,
          dto.provider,
          profile,
        );
      }
    }

    if (!user) {
      if (!profile.email) {
        throw new BadRequestException(
          'Social account email is required to create a user',
        );
      }

      const role = await this.getDefaultUserRole();
      user = await this.usersService.createSocialUser({
        name: profile.name || profile.email.split('@')[0],
        email: profile.email.toLowerCase(),
        phone: dto.phone,
        avatar: dto.avatar ?? profile.avatar ?? null,
        deviceId: dto.deviceId,
        fcmToken: dto.fcmToken,
        ip: dto.ip,
        appVersion: dto.appVersion,
        profileType: ProfileType.USER,
        role,
      });

      await this.userAuthProviderService.create(user.id, dto.provider, profile);
    }

    await this.usersService.touchLastLogin(user.id);

    return {
      message: 'Login successful',
      user: this.toUserResponse(user),
      accessToken: await this.signToken(user),
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(
      dto.email.toLowerCase().trim(),
    );
    // Always return success to avoid email enumeration
    if (!user?.email) {
      return { message: 'If the email exists, an OTP has been sent' };
    }

    const otp = await this.passwordResetTokenService.createToken(
      user,
      PasswordResetTokenType.FORGOT_PASSWORD,
    );
    await this.mailService.sendResetPasswordEmail(user.email, user.name, otp);
    return { message: 'If the email exists, an OTP has been sent' };
  }

  async resendOtp(dto: ResendOtpDto) {
    return this.forgotPassword(dto);
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.findUserByEmailOrFail(dto.email);
    const token = await this.passwordResetTokenService.verifyToken(
      user.id,
      dto.otp,
      PasswordResetTokenType.FORGOT_PASSWORD,
    );

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.usersService.updatePassword(user.id, hashedPassword);
    await this.passwordResetTokenService.markUsed(token);

    return { message: 'Password reset successful' };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findByIdOrFail(userId);
    return this.toUserResponse(user);
  }

  private async findUserByEmailOrFail(email: string): Promise<User> {
    const user = await this.usersService.findByEmail(
      email.toLowerCase().trim(),
    );
    if (!user) {
      throw new BadRequestException('User not found');
    }
    return user;
  }

  private async getDefaultUserRole(): Promise<Role> {
    const role =
      (await this.roleRepository.findOne({ where: { code: 'USER' } })) ??
      (await this.roleRepository.findOne({ where: { code: 'SUPER_ADMIN' } }));

    if (!role) {
      throw new BadRequestException(
        'Default role not found. Please run role seeders first.',
      );
    }
    return role;
  }

  private async signToken(user: User): Promise<string> {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email ?? '',
    });
  }

  private toUserResponse(user: User): UserResponseDto {
    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  private async verifySocialToken(
    provider: SocialAuthProvider,
    idToken: string,
  ): Promise<SocialProfile> {
    if (provider === SocialAuthProvider.GOOGLE) {
      return this.verifyGoogleToken(idToken);
    }
    if (provider === SocialAuthProvider.APPLE) {
      return this.verifyAppleToken(idToken);
    }
    throw new BadRequestException('Unsupported social provider');
  }

  private async verifyGoogleToken(idToken: string): Promise<SocialProfile> {
    if (!this.googleClient) {
      throw new BadRequestException('Google login is not configured');
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid Google token');
    }

    return {
      providerUserId: payload.sub,
      email: payload.email ?? null,
      name: payload.name ?? null,
      avatar: payload.picture ?? null,
    };
  }

  private async verifyAppleToken(idToken: string): Promise<SocialProfile> {
    const clientId = this.configService.get<string>('APPLE_CLIENT_ID');
    if (!clientId) {
      throw new BadRequestException('Apple login is not configured');
    }

    try {
      const payload = await appleSignin.verifyIdToken(idToken, {
        audience: clientId,
      });

      return {
        providerUserId: payload.sub,
        email: payload.email ?? null,
        name: null,
        avatar: null,
      };
    } catch (error) {
      this.logger.warn(`Apple token verification failed: ${String(error)}`);
      throw new UnauthorizedException('Invalid Apple token');
    }
  }
}
