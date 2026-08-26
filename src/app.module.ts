import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDatabaseOptions } from './config/database.config';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { PermissionGuard } from './auth/guards/permission.guard';
import {
  Activity,
  ChartOfAccount,
  City,
  Client,
  Country,
  Driver,
  DriverDocument,
  PasswordResetToken,
  Permission,
  Role,
  State,
  SystemSetting,
  User,
  UserAuthProvider,
  Vehicle,
  Vendor,
  VendorCategory,
} from './database/entities';
import {
  AppController,
  AuthController,
  GeoController,
  ProfileController,
  PusherController,
  SystemSettingController,
  VendorsController,
  VendorCategoriesController,
} from './controllers';
import {
  AppService,
  AuthService,
  GeoService,
  MailService,
  PasswordResetTokenService,
  ProfileService,
  PusherService,
  S3Service,
  SystemSettingService,
  UserAuthProviderService,
  UsersService,
  VendorsService,
  VendorCategoriesService,
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
      VendorCategory,
      Vehicle,
      ChartOfAccount,
      Country,
      State,
      City,
      SystemSetting,
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
    GeoController,
    SystemSettingController,
    VendorsController,
    VendorCategoriesController,
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
    GeoService,
    SystemSettingService,
    VendorsService,
    VendorCategoriesService,
    JwtStrategy,
    PermissionGuard,
  ],
})
export class AppModule {}
