import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { ChangePassword, Login, RecoveryPassword } from './dto/auth.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { UserPayload } from 'src/core/interfaces/user-payload.interface';
import { AuthGuard } from '@nestjs/passport';
import { JwtTCPStrategy } from 'src/core/strategies/jwtTCP.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private jwtTCPStrategy: JwtTCPStrategy,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión y obtener token JWT' })
  @ApiResponse({
    status: 200,
    description: 'Inicio de sesión exitoso',
    schema: {
      example: {
        message: 'Login successful',
        statusCode: 200,
        status: 'Success',
        meta: {
          payload: {
            _id: 'id-usuario',
            name: 'Juan',
            lastName: 'Pérez',
            email: 'juan@mail.com',
            username: 'juanp',
            date_joined: '2025-08-06T12:00:00Z',
            isActived: true,
            isAdmin: false,
            company: 'EmpresaX',
            modules: ['mod1', 'mod2'],
            roles: ['Admin', 'Editor'],
            permissions: ['create', 'read', 'update'],
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
  login(@Body() login: Login) {
    return this.authService.login(login);
  }

  @Post('change-password')
  @ApiOperation({ summary: 'Cambiar contraseña' })
  @ApiResponse({
    status: 200,
    description: 'Cambio de contraseña exitoso',
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
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({ status: 400, description: 'Error al cambiar contraseña' })
  @ApiBody({ type: ChangePassword })
  changePassword(@Body() changePassword: ChangePassword) {    
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
  async validateUser(@Req() req: any) {
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


  @Post('recovery-password')
  @ApiOperation({ summary: 'Recuperar contraseña' })
  @ApiResponse({
    status: 200,
    description: 'Recuperación de contraseña exitoso',
    schema: {
      example: {
        message: 'recovery password successful',
        statusCode: 200,
        status: 'Success',
        data: 'Nombre de usuario',
        meta: {
          totalData: 1,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 500, description: 'Error al actualizar contraseña' })
  @ApiBody({ type: RecoveryPassword })
  recoveryPassword(@Body() recoveryPassword: RecoveryPassword) {        
    return this.authService.recoveryPassword(recoveryPassword);
  }




  // Endpoint de microservicio (no documentado por Swagger)
  @MessagePattern({ cmd: 'login' })
  msLogin(@Payload() login: Login) {
    return this.authService.login(login);
  }

  @MessagePattern({ cmd: 'validateUser' })
  async msValidateUser(@Payload() token: string) {
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

  
}
