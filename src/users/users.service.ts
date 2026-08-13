import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { MailService } from 'src/mail/mail.service';
import * as generatePassword from 'generate-password';
import {
  resolveUserRoles,
  resolveUserPermissions,
  resolveUserModules,
} from './helpers/user-resolution.helper';
import { toPublicUser } from './helpers/user.sanitizer';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Rol') private readonly rolModel: Model<any>,
    @InjectModel('Permission') private readonly permissionModel: Model<any>,
    @InjectModel('Module') private readonly moduleModel: Model<any>,
    private readonly mailService: MailService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    // Generar contraseña temporal segura
    const tempPassword = generatePassword.generate({
      length: 12,
      numbers: true,
      uppercase: true,
      symbols: true,
      strict: true,
    });

    const userData = {
      ...createUserDto,
      _id: createUserDto._id, // Si viene de otra app, lo usamos; si no, será undefined y Mongo lo generará
      password: tempPassword,
    };

    const newUser = new this.userModel(userData);
    const result = await newUser.save();

    this.mailService
      .sendEmail({
        to: result.email,
        subject: 'Bienvenido a BpoNet - Activa tu cuenta',
        template: 'welcome',
        context: {
          name: result.name,
          platform_name: 'BpoNet',
          username: result.email,
          password: tempPassword,
          login_url: userData.redirectUri
            ? userData.redirectUri
            : 'https://app.bponet.com.co',
        },
      })
      .catch((error: any) => {
        this.logger.error('Error sending email: ' + error?.message, error?.stack);
      });

    return {
      data: toPublicUser(result.toObject()),
      message: 'User created successfully. Activation email sent.',
      meta: {
        totalData: 1,
        createdAt: new Date().toISOString(),
        id: result._id,
      },
    };
  }

  async createExternal(payload: any) {
    // Generar contraseña temporal segura
    const tempPassword = generatePassword.generate({
      length: 12,
      numbers: true,
      uppercase: true,
      symbols: true,
      strict: true,
    });

    const userRoles = await resolveUserRoles(payload, this.rolModel);
    const userPermissions = await resolveUserPermissions(payload, this.permissionModel);
    const userModules = await resolveUserModules(payload, this.moduleModel);

    const userData = {
      _id: payload._id,
      tenantId: payload.tenantId || payload.company || 'default_tenant',
      name: payload.name,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone,
      username: payload.username || payload.email,
      password: tempPassword,
      company: payload.company || 'default_company',
      redirectUri: payload.redirectUri || null,
      roles: userRoles,
      permissions: userPermissions,
      modules: userModules,
      isActived: payload.isActived !== undefined ? payload.isActived : true,
      isAdmin: payload.isAdmin !== undefined ? payload.isAdmin : false,
      isSuperAdmin:
        payload.isSuperAdmin !== undefined ? payload.isSuperAdmin : false,
      isNewUser: payload.isNewUser !== undefined ? payload.isNewUser : true,
    };

    const newUser = new this.userModel(userData);
    const result = await newUser.save();

    this.mailService
      .sendEmail({
        to: result.email,
        subject: 'Bienvenido a BpoNet - Activa tu cuenta',
        template: 'welcome',
        context: {
          name: result.name,
          platform_name: 'BpoNet',
          username: result.email,
          password: tempPassword,
          login_url: payload.redirectUri
            ? payload.redirectUri
            : 'https://app.bponet.com.co',
        },
      })
      .catch((error: any) => {
        this.logger.error('Error sending email: ' + error?.message, error?.stack);
      });

    return {
      statusCode: 201,
      status: 'Success',
      message: 'User created successfully. Activation email sent.',
      data: toPublicUser(result.toObject()),
      meta: {
        totalData: 1,
        createdAt: new Date().toISOString(),
        id: result._id,
      },
    };
  }

  async findAll(user?: any) {
    const query: any = {};
    if (user && !user.isSuperAdmin) {
      query.company = user.company;
    }

    const users = await this.userModel.find(query).lean().exec();
    if (!users || users.length === 0) {
      throw new NotFoundException('No users found');
    }
    return users.map((u: any) => toPublicUser(u));
  }

  async findActiveByTenant(user?: any, onlyAgents?: unknown) {
    const query: any = { isActived: true };

    if (user && !user.isSuperAdmin) {
      const tenantId = user.tenantId || user.company;
      const company = user.company || user.tenantId;
      if (tenantId && company && tenantId !== company) {
        query.$or = [{ tenantId }, { company }, { tenantId: company }, { company: tenantId }];
      } else if (tenantId || company) {
        const val = tenantId || company;
        query.$or = [{ tenantId: val }, { company: val }];
      }
    }

    const users = await this.userModel.find(query).lean().exec();
    const list = users || [];

    const isOnlyAgents =
      onlyAgents === true ||
      onlyAgents === 'true' ||
      String(onlyAgents).toLowerCase() === 'true';

    let filtered = list;
    if (isOnlyAgents) {
      filtered = list.filter((u: any) =>
        u.roles?.some((r: any) => r?.codeRol === 'AGE' || r === 'AGE'),
      );
    }

    return {
      message: 'Active users retrieved by tenant successfully',
      statusCode: 200,
      status: 'Success',
      data: filtered.map((u: any) => toPublicUser(u)),
      meta: { totalData: filtered.length },
    };
  }

  async findByPage(user?: any, from?: number, limit?: number, global?: any) {
    const { isSuperAdmin } = user;
    const query: any = {};

    if (!isSuperAdmin) {
      query.company = user.company;
    }

    if (global) {
      const regex = new RegExp(global, 'i');
      if (isSuperAdmin) {
        query.$or = [
          { name: regex },
          { lastName: regex },
          { username: regex },
          { email: regex },
          { phone: regex },
          { company: regex },
        ];
      } else {
        query.$or = [
          { name: regex },
          { lastName: regex },
          { username: regex },
          { email: regex },
          { phone: regex },
        ];
      }
    }
    const skipNumber = from && from >= 0 ? from : 0;
    const limitNumber = limit && limit > 0 ? limit : 100;

    const [docs, totalData] = await Promise.all([
      this.userModel
        .find(query)
        .skip(skipNumber)
        .limit(limitNumber)
        .lean()
        .exec(),
      this.userModel.countDocuments(query).exec(),
    ]);

    return {
      data: docs.map((u: any) => toPublicUser(u)),
      meta: {
        totalData: totalData,
      },
    };
  }

  // Paginación simple: ?page=1&limit=10 (puedes mejorarla con DTO o query params en el controller)
  async findByPagination(user?: any, page = 1, limit = 10) {
    const query: any = {};
    if (user && !user.isSuperAdmin) {
      query.company = user.company;
    }

    const skip = (page - 1) * limit;
    const [users, totalData] = await Promise.all([
      this.userModel.find(query).skip(skip).limit(limit).lean().exec(),
      this.userModel.countDocuments(query).exec(),
    ]);

    return {
      data: users.map((u: any) => toPublicUser(u)),
      meta: {
        totalData,
        page,
        limit,
      },
    };
  }

  // Búsqueda simple por ID
  async findOne(id: string) {
    const user = await this.userModel.findById(id).lean().exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return toPublicUser(user);
  }

  // Si quieres filtrar por fecha de creación, ajusta el DTO y lógica aquí
  async findByDate(user?: any, startDate?: string, endDate?: string) {
    // Validación simple de fechas
    if (!startDate || !endDate) {
      throw new NotFoundException(
        'You must provide both startDate and endDate',
      );
    }

    // Convierte las fechas a objetos Date
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Ajusta si quieres incluir el final completo del día (opcional)
    end.setHours(23, 59, 59, 999);

    // Busca por rango de fechas en createdAt
    const query: any = {
      createdAt: {
        $gte: start,
        $lte: end,
      },
    };

    if (user && !user.isSuperAdmin) {
      query.company = user.company;
    }

    const users = await this.userModel.find(query).lean().exec();

    if (!users || users.length === 0) {
      throw new NotFoundException('No users found for given date range');
    }

    return {
      message: 'Users retrieved by date range successfully',
      data: users.map((u: any) => toPublicUser(u)),
      meta: {
        totalData: users.length,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .lean()
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return toPublicUser(updatedUser);
  }

  async remove(id: string) {
    const deletedUser = await this.userModel.findByIdAndDelete(id).lean().exec();
    if (!deletedUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return toPublicUser(deletedUser);
  }

  async getProfile(user: any) {
    const found = await this.userModel.findById(user._id).lean().exec();
    if (!found) {
      throw new NotFoundException('User not found');
    }

    return {
      message: 'Profile retrieved successfully',
      data: {
        user: toPublicUser(found),
        modules: found.modules || [],
        roles: found.roles || [],
        permissions: found.permissions || [],
      },
      meta: {
        totalData: 1,
        id: found._id,
      },
    };
  }

  async getUserModules(user: any) {
    const found = await this.userModel
      .findById(user._id)
      .select('modules')
      .lean()
      .exec();
    if (!found) {
      throw new NotFoundException('User not found');
    }
    return {
      message: 'Modules retrieved successfully',
      data: found.modules || [],
      meta: {
        totalData: (found.modules || []).length,
        id: found._id,
      },
    };
  }

  async getUserRoles(user: any) {
    const found = await this.userModel
      .findById(user._id)
      .select('roles')
      .lean()
      .exec();
    if (!found) {
      throw new NotFoundException('User not found');
    }
    return {
      message: 'Roles retrieved successfully',
      data: found.roles || [],
      meta: {
        totalData: (found.roles || []).length,
        id: found._id,
      },
    };
  }

  async getUserPermissions(user: any) {
    const found = await this.userModel
      .findById(user._id)
      .select('permissions')
      .lean()
      .exec();
    if (!found) {
      throw new NotFoundException('User not found');
    }
    return {
      message: 'Permissions retrieved successfully',
      data: found.permissions || [],
      meta: {
        totalData: (found.permissions || []).length,
        id: found._id,
      },
    };
  }
}
