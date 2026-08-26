import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDatabaseOptions } from './config/database.config';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import {
  Activity,
  ChartOfAccount,
  Client,
  Driver,
  DriverDocument,
  Lead,
  PasswordResetToken,
  Permission,
  Role,
  User,
  UserAuthProvider,
  Vehicle,
  Vendor,
} from './database/entities';
import {
  AppController,
  AuthController,
  ProfileController,
  PusherController,
} from './controllers';
import {
  AppService,
  AuthService,
  MailService,
  PasswordResetTokenService,
  ProfileService,
  PusherService,
  S3Service,
  UserAuthProviderService,
  UsersService,
} from './services';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: () => buildDatabaseOptions(),
    }),
    TypeOrmModule.forFeature([
      User,
      Role,
      Permission,
      PasswordResetToken,
      UserAuthProvider,
      Activity,
      Driver,
      DriverDocument,
      Client,
      Vendor,
      Vehicle,
      Lead,
      ChartOfAccount,
    ]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
            '7d') as `${number}d`,
        },
      }),
    }),
  ],
  controllers: [
    AppController,
    AuthController,
    ProfileController,
    PusherController,
  ],
  providers: [
    AppService,
    AuthService,
    ProfileService,
    UsersService,
    MailService,
    PasswordResetTokenService,
    UserAuthProviderService,
    PusherService,
    S3Service,
    JwtStrategy,
  ],
})
export class AppModule {}
