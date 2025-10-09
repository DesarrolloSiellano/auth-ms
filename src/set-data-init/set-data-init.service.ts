import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Permission } from 'src/permissions/entities/permission.entity';
import { Rol } from 'src/roles/entities/role.entity';
import { User } from 'src/users/entities/user.entity';

import { PERMISSIONS } from 'src/set-data-init/helpers/permissions.admin';
import { ROLES } from 'src/set-data-init/helpers/role.admin';
import { ADMIN_USER } from './helpers/user.admin';
import Module from 'module';
import { ADMIN_MODULE } from './helpers/modules.admin';

@Injectable()
export class SetDataInit implements OnApplicationBootstrap {
  private readonly logger = new Logger(SetDataInit.name);

  constructor(
    @InjectModel('Rol') private readonly rolModel: Model<Rol>,
    @InjectModel('Permission')
    private readonly permissionsModel: Model<Permission>,
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Module') private readonly moduleModel: Model<Module>,
  ) {}

  async createInitModules() {
    try {
      await this.moduleModel.insertMany(ADMIN_MODULE, { ordered: false });
      this.logger.log('Modules initialized successfully');
    } catch (error) {
      if (error.code === 11000) {
        this.logger.warn('Some modules already exist, skipping duplicates');
      } else {
        throw error;
      }
    }
  }

  async createInitRoles() {
    try {
      // Obtén todos los permisos de la base de datos
      const permissions = await this.permissionsModel.find().exec();
      // Para cada rol en ROLES crea un nuevo documento con el arreglo de IDs de permisos
      for (const role of ROLES) {
        // Crea un nuevo objeto rol pasando las propiedades del rol y asignando permisos solo con _id
        const newRole = new this.rolModel({
          ...role,
          permissions: permissions.map((permission) => ({
            _id: permission._id,
            name: permission.name,
            description: permission.description,
            action: permission.action,
            isActive: permission.isActive,
            // cualquier otro campo relevante según el esquema
          })),
        });
        // Guarda el nuevo rol en la base de datos
        await newRole.save();
      }

      this.logger.log('Roles initialized successfully');
    } catch (error) {
      if (error.code === 11000) {
        this.logger.warn('Some roles already exist, skipping duplicates');
      } else {
        this.logger.error('Error initializing roles', error);
        throw error;
      }
    }
  }

  async createInitPermissions() {
    try {
      await this.permissionsModel.insertMany(PERMISSIONS, { ordered: false });
      this.logger.log('Permissions initialized successfully');
    } catch (error) {
      if (error.code === 11000) {
        this.logger.warn('Some permissions already exist, skipping duplicates');
      } else {
        throw error;
      }
    }
  }

 async createAdminUsers() {
  try {
    const modules = await this.moduleModel.find().exec();

    
    const permissions = await this.permissionsModel.find().exec();
    const roles = await this.rolModel.find().exec();
    // Prepara subdocumentos para módulos y permisos que serán iguales para todos los admins
    // Recorrer cada administrador en ADMIN_USER y crear documento en DB con los subdocumentos
    for (const adminUser of ADMIN_USER) {
      const admin = new this.userModel({
        ...adminUser,
        modules: modules,
        roles: roles,
        permissions: permissions,
      });

      await admin.save();
      this.logger.log(`Admin user ${adminUser.email || adminUser.username} created successfully.`);
    }
  } catch (error) {
    this.logger.error('Error creating admin users', error);
    throw error;
  }
}


  async onApplicationBootstrap() {
    await this.validateIfDataExists();
  }

  async validateIfDataExists() {
    try {
      const moduleCount = await this.moduleModel.countDocuments().exec();
      const rolCount = await this.rolModel.countDocuments().exec();
      const permissionsCount = await this.permissionsModel
        .countDocuments()
        .exec();
      const userCount = await this.userModel.countDocuments().exec();

      if (moduleCount === 0) {
        this.logger.warn('No modules found, creating an admin module...');
        await this.createInitModules();
      }
      if (permissionsCount === 0) {
        this.logger.warn('No permissions found, creating an data admin...');
        await this.createInitPermissions();
      }
      if (rolCount === 0) {
        this.logger.warn('No roles found, creating an data admin...');
        await this.createInitRoles();
      }
      if (userCount === 0) {
        this.logger.warn('No users found, creating an admin user...');
        await this.createAdminUsers();
      }
    } catch (error) {
      this.logger.error('Error validating if data exists', error);
    }
  }
}
