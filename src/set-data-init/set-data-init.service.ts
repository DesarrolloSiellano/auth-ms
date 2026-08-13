import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Permission } from 'src/permissions/entities/permission.entity';
import { Rol } from 'src/roles/entities/role.entity';
import { User } from 'src/users/entities/user.entity';
import { Module } from 'src/modules/entities/module.entity';
import { Company } from 'src/companies/entities/company.entity';

import { PERMISSIONS } from 'src/set-data-init/helpers/permissions.admin';
import { ROLES } from 'src/set-data-init/helpers/role.admin';
import { ADMIN_USER } from './helpers/user.admin';
import { ADMIN_MODULE } from './helpers/modules.admin';
import { ADMIN_COMPANY } from './helpers/companies.admin';

import { tenantLocalStorage } from 'src/core/database/tenant.context';

@Injectable()
export class SetDataInit implements OnApplicationBootstrap {
  private readonly logger = new Logger(SetDataInit.name);

  constructor(
    @InjectModel('Rol') private readonly rolModel: Model<Rol>,
    @InjectModel('Permission')
    private readonly permissionsModel: Model<Permission>,
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Module') private readonly moduleModel: Model<Module>,
    @InjectModel('Company') private readonly companyModel: Model<Company>,
  ) {}

  async createInitModules() {
    try {
      for (const moduleItem of ADMIN_MODULE) {
        const moduleExists = await this.moduleModel
          .findOne({ name: moduleItem.name })
          .lean()
          .exec();

        if (moduleExists) {
          this.logger.warn(
            `Module ${moduleItem.name} already exists, skipping.`,
          );
          continue;
        }
        await this.moduleModel.create(moduleItem);
        this.logger.log(`Module ${moduleItem.name} created successfully.`);
      }
    } catch (error) {
      this.logger.error('Error initializing modules', error);
      throw error;
    }
  }

  async createInitPermissions() {
    try {
      for (const permission of PERMISSIONS) {
        const permissionExists = await this.permissionsModel
          .findOne({ name: permission.name })
          .lean()
          .exec();

        if (permissionExists) {
          this.logger.warn(
            `Permission ${permission.name} already exists, skipping.`,
          );
          continue;
        }

        await this.permissionsModel.create(permission);
        this.logger.log(`Permission ${permission.name} created successfully.`);
      }

      this.logger.log('Permissions initialized successfully');
    } catch (error) {
      if (error.code === 11000) {
        this.logger.warn('Some permissions already exist, skipping duplicates');
      } else {
        this.logger.error('Error initializing permissions', error);
        throw error;
      }
    }
  }

  async createInitRoles() {
    try {
      const permissions = await this.permissionsModel.find().lean().exec();

      for (const role of ROLES) {
        const roleExists = await this.rolModel
          .findOne({ name: role.name })
          .lean()
          .exec();

        if (roleExists) {
          this.logger.warn(`Role ${role.name} already exists, skipping.`);
          continue;
        }

        /**
         * Definir permisos activos según el rol
         */
        const rolePermissions = permissions.map((permission) => {
          let isPermissionActive = false;

          /**
           * ADMINISTRADOR
           * Todos los permisos activos
           */
          if (role.codeRol === 'ADM') {
            isPermissionActive = true;
          }

          /**
           * AUDITOR
           * Solo READ
           */
          if (role.codeRol === 'AUD') {
            isPermissionActive = permission.action === 'read';
          }

          /**
           * USUARIO BÁSICO
           * CREATE, READ, UPDATE activos
           * DELETE desactivado
           */
          if (role.codeRol === 'USR') {
            isPermissionActive = ['create', 'read', 'update'].includes(
              permission.action,
            );
          }

          return {
            _id: permission._id,
            name: permission.name,
            description: permission.description,
            action: permission.action,
            resource: permission.resource,
            type: permission.type,
            isActive: isPermissionActive,
          };
        });

        const newRole = new this.rolModel({
          ...role,
          permissions: rolePermissions,
        });

        await newRole.save();

        this.logger.log(`Role ${role.name} created successfully.`);
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

  async createInitCompanies() {
    try {
      await this.companyModel.insertMany(ADMIN_COMPANY, { ordered: false });
      this.logger.log('Companies initialized successfully');
    } catch (error) {
      if (error.code === 11000) {
        this.logger.warn('Some companies already exist, skipping duplicates');
      } else {
        this.logger.error('Error initializing companies', error);
        throw error;
      }
    }
  }

  async createAdminUsers() {
    try {
      const company = await this.companyModel
        .findOne({ name: 'BPONET' })
        .lean()
        .exec();

      if (!company) {
        this.logger.error(
          'Company BPONET was not found. Admin users cannot be created.',
        );
        return;
      }

      const modules = await this.moduleModel.find().lean().exec();
      const permissions = await this.permissionsModel.find().lean().exec();
      const roles = await this.rolModel.find().lean().exec();

      const tenantId = String(company.id);
      const companyName = String(company.name);

      for (const adminUser of ADMIN_USER) {
        const existingAdmin = await this.userModel
          .findOne({
            company: companyName,
            $or: [
              ...(adminUser.email ? [{ email: adminUser.email }] : []),
              ...(adminUser.username ? [{ username: adminUser.username }] : []),
            ],
          })
          .lean()
          .exec();

        if (existingAdmin) {
          this.logger.warn(
            `Admin user ${adminUser.email || adminUser.username} already exists in BPONET, skipping.`,
          );
          continue;
        }

        await tenantLocalStorage.run(
          {
            tenantId,
            companyId: companyName,
            isSuperAdmin: true,
          },
          async () => {
            const admin = new this.userModel({
              ...adminUser,
              modules,
              roles,
              permissions,
              company: companyName,
              tenantId,
            });

            await admin.save();

            this.logger.log(
              `Admin user ${adminUser.email || adminUser.username} created successfully.`,
            );
          },
        );
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
      /**
       * Modules
       */
      this.logger.log('Validating initial modules...');
      await this.createInitModules();

      /**
       * Permissions
       */
      this.logger.log('Validating initial permissions...');
      await this.createInitPermissions();

      /**
       * Roles
       */
      this.logger.log('Validating initial roles...');
      await this.createInitRoles();

      /**
       * Companies
       */
      this.logger.log('Validating initial companies...');
      await this.createInitCompanies();

      /**
       * Buscar empresa BPONET
       */
      const bponetCompany = await this.companyModel
        .findOne({ name: 'BPONET' })
        .lean()
        .exec();

      if (!bponetCompany) {
        this.logger.error(
          'BPONET company does not exist after initialization.',
        );
        return;
      }

      /**
       * Crear admins si no existen
       */
      if (process.env.NODE_ENV === 'production') {
        this.logger.warn(
          'NODE_ENV=production: NO se crean usuarios admin por defecto. ' +
            'Crea el superadmin inicial manualmente con: npm run script:create-admin ' +
            '(requiere ADMIN_EMAIL y ADMIN_PASSWORD).',
        );
      } else {
        await this.createAdminUsers();
      }

      this.logger.log('Initial data validation completed successfully.');
    } catch (error) {
      this.logger.error('Error validating initial data', error);
    }
  }
}
