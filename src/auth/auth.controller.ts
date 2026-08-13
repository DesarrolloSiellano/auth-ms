import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ThrottlerHybridGuard } from 'src/core/guards/throttler-hybrid.guard';
import express from 'express';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import {
  ChangePassword,
  Login,
  RecoveryPassword,
  SetPasswordWithToken,
  RefreshToken,
} from './dto/auth.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserPayload } from 'src/core/interfaces/user-payload.interface';
import { AuthGuard } from '@nestjs/passport';
import { JwtTCPStrategy } from 'src/core/strategies/jwtTCP.strategy';
import { RealIP } from 'nestjs-real-ip';
import { ConfigService } from '@nestjs/config';

@ApiTags('auth')
@Controller('auth')
@UseGuards(ThrottlerHybridGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly whitelist: string[];

  constructor(
    private readonly authService: AuthService,
    private jwtTCPStrategy: JwtTCPStrategy,
    private readonly configService: ConfigService,
  ) {
    this.whitelist = (
      this.configService.get<string>('SSO_ALLOWED_ORIGINS') ?? ''
    )
      .split(',')
      .map((domain) => domain.trim())
      .filter((domain) => domain !== '');
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Iniciar sesión y obtener token JWT',
    description:
      'El JWT de acceso contiene SOLO identidad (_id, name, email, company, tenantId, ...) — ' +
      'no modules/roles/permissions. Tras el login, consume el árbol de autorización vía ' +
      'GET /api/users/profile. Si se envía redirectUri (origen en la whitelist SSO_ALLOWED_ORIGINS), ' +
      'se redirige con ?access_token= y ?refresh_token=.',
  })
  @ApiResponse({
    status: 200,
    description: 'Inicio de sesión exitoso',
    schema: {
      example: {
        message: 'Login successful',
        statusCode: 200,
        status: 'Success',
        url: 'http://localhost:4201/pages/dashboard?access_token=...',
        meta: {
          payload: {
            _id: 'id-usuario',
            name: 'Juan',
            lastName: 'Pérez',
            email: 'juan@mail.com',
            username: 'juanp',
            isActived: true,
            company: 'EmpresaX',
            tenantId: '000000',
            isSuperAdmin: false,
          },
          totalData: 1,
          token: 'jwt.token.aqui',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiBody({ type: Login })
  async login(
    @Body() login: Login,
    @Query('redirectUri') redirectUri: string,
    @Res({ passthrough: true }) res: express.Response,
    @RealIP() ip: string,
  ) {
    const result = await this.authService.login(login, ip);

    if (redirectUri && redirectUri !== 'null') {
      try {
        const url = new URL(redirectUri);
        const isAllowed = this.whitelist.some(
          (domain) =>
            url.hostname === domain || url.hostname.endsWith('.' + domain),
        );

        if (isAllowed) {
          url.searchParams.append('access_token', result.meta.accessToken);
          url.searchParams.append('refresh_token', result.meta.refreshToken);
          return {
            url: url.toString(),
            message: 'Login successful',
          };
        }
      } catch (e) {
        // En caso de que redirectUri no sea una URL válida, ignorar redirección
        this.logger.warn(`Error redirectUri: ${e?.message}`);
      }
    }

    return result;
  }

  @Post('recovery-password')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Recuperar contraseña' })
  @ApiResponse({
    status: 200,
    description: 'Cambio de contraseña exitoso',
    schema: {
      example: {
        message: 'recovery password successful',
        statusCode: 200,
        status: 'Success',
        data: 'Email enviado',
        meta: {
          totalData: 1,
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Error al recuperar contraseña' })
  @ApiBody({ type: RecoveryPassword })
  recoveryPassword(
    @Body() recoveryPassword: RecoveryPassword,
    @Query('redirectUri') redirectUri: string,
  ) {
    return this.authService.recoveryPassword(recoveryPassword, redirectUri);
  }

  @Post('change-password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cambiar contraseña (requiere JWT)',
    description:
      'Requiere Authorization: Bearer <token>. El _id se toma del token (el campo id del body se ignora). ' +
      'Verifica la contraseña actual y guarda la nueva (hasheada con bcrypt).',
  })
  @ApiResponse({
    status: 200,
    description: 'Cambio de contraseña exitoso ',
    schema: {
      example: {
        message: 'change password successful',
        statusCode: 200,
        status: 'Success',
        data: 'Nombre de usuario',
        meta: {
          totalData: 1,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Token inválido o credenciales inválidas' })
  @ApiResponse({ status: 400, description: 'Error al cambiar contraseña' })
  @ApiBody({ type: ChangePassword })
  changePassword(@Body() changePassword: ChangePassword, @Req() req: any) {
    // El _id siempre proviene del token, nunca del body
    changePassword.id = req.user._id;
    return this.authService.changePassword(changePassword);
  }

  @Get('validate-user')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({
    summary: 'Valida el token JWT y retorna el usuario desde la DB',
  })
  @ApiResponse({
    status: 200,
    description: 'Usuario autenticado correctamente',
    schema: {
      example: {
        user: {
          _id: 'id-user',
          name: 'Juan',
          email: 'juan@mail.com',
          roles: [
            {
              _id: 'id-role',
              name: 'Administrador',
              codeRol: 'ADM',
              description:
                'Acceso completo al sistema con privilegios de superusuario',
              isActive: true,
              isInheritPermissions: false,
              permissions: [
                {
                  _id: 'id-permission',
                  name: 'Crear',
                  description: 'Permite registrar nuevos datos en el sistema',
                  action: 'create',
                  isActive: true,
                },
              ],
            },
          ],
          permissions: [
            {
              _id: 'id-permission',
              name: 'Eliminar',
              description: 'Permite borrar o eliminar de una tabla',
              action: 'delete',
              isActive: false,
            },
          ],
          modules: [
            {
              _id: 'id-module',
              name: 'adminUserModule',
              description: 'Module for admin user functionalities',
              isActive: true,
              isSystemModule: true,
            },
          ],
          company: 'Company Admin',
          isActived: true,
          isAdmin: true,
          isNewUser: true,
        },
        meta: {
          totalData: 1,
          id: 'id-user',
          valid: true,
        },
      },
    },
  })
  @ApiBearerAuth()
  validateUser(@Req() req: any) {
    const user = req.user as UserPayload;

    return {
      user,
      meta: {
        totalData: 1,
        id: user?._id,
        valid: true,
      },
    };
  }

  @Post('set-password-token')
  @ApiOperation({
    summary: 'Establecer contraseña usando un token de activación',
  })
  @ApiResponse({
    status: 200,
    description: 'Contraseña establecida exitosamente',
  })
  @ApiResponse({ status: 400, description: 'Token inválido o expirado' })
  @ApiBody({ type: SetPasswordWithToken })
  setPasswordWithToken(@Body() setPasswordDto: SetPasswordWithToken) {
    return this.authService.setPasswordWithToken(setPasswordDto);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('refresh')
  @ApiOperation({
    summary: 'Refrescar token de acceso',
    description:
      'Verifica la firma/expiración del refresh token (JWT_REFRESH_SECRET), localiza la sesión activa por su hash y ' +
      'emite un nuevo access token con el payload de identidad. Los refresh tokens se almacenan hasheados (sha256).',
  })
  @ApiResponse({
    status: 200,
    description: 'Token refrescado correctamente',
    schema: {
      example: {
        statusCode: 200,
        status: 'Success',
        message: 'Token refreshed successfully',
        accessToken: 'jwt.token.aqui',
        payload: {
          _id: 'id-usuario',
          name: 'Juan',
          lastName: 'Pérez',
          email: 'juan@mail.com',
          username: 'juanp',
          isActived: true,
          company: 'EmpresaX',
          tenantId: '000000',
          isSuperAdmin: false,
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Token de refresco inválido o expirado',
  })
  async refresh(@Body() refreshTokenDto: RefreshToken) {
    return this.authService.refreshAccessToken(refreshTokenDto.refreshToken);
  }

  // Endpoint de microservicio (no documentado por Swagger)
  @MessagePattern({ cmd: 'login' })
  msLogin(@Payload() login: Login) {
    const ip = (login as any)?.meta?.ip || (login as any)?.ip || '';
    return this.authService.login(login, ip);
  }

  @MessagePattern({ cmd: 'validateUser' })
  async msValidateUser(@Payload() payload: any) {
    const token = payload?.token ?? payload;
    const user = await this.jwtTCPStrategy.validate(token);
    return {
      user,
      meta: {
        totalData: 1,
        id: user?._id,
        valid: true,
      },
    };
  }

  @MessagePattern({ cmd: 'refresh' })
  async msRefresh(@Payload() refreshTokenDto: RefreshToken) {
    return this.authService.refreshAccessToken(refreshTokenDto.refreshToken);
  }

  @MessagePattern({ cmd: 'changePassword' })
  msRecoveryPassword(@Payload() changePassword: ChangePassword) {
    return this.authService.changePassword(changePassword);
  }
}
