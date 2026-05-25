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
          .select('_id')
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
      const permissionsToInsert = PERMISSIONS.map((permission) => ({
        ...permission,
      }));

      await this.permissionsModel.insertMany(permissionsToInsert, {
        ordered: false,
      });

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
      const permissions = await this.permissionsModel.find().exec();

      for (const role of ROLES) {
        const roleExists = await this.rolModel
          .findOne({ name: role.name })
          .lean()
          .exec();

        if (roleExists) {
          this.logger.warn(`Role ${role.name} already exists, skipping.`);
          continue;
        }

        const newRole = new this.rolModel({
          ...role,
          permissions: permissions.map((permission) => ({
            _id: permission._id,
            name: permission.name,
            description: permission.description,
            action: permission.action,
            isActive: permission.isActive,
          })),
        });

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
        .exec();

      if (!company) {
        this.logger.error(
          'Company BPONET was not found. Admin users cannot be created.',
        );
        return;
      }

      const modules = await this.moduleModel.find().exec();
      const permissions = await this.permissionsModel.find().exec();
      const roles = await this.rolModel.find().exec();

      const tenantId = String(company._id);
      const companyId = String(company._id);

      for (const adminUser of ADMIN_USER) {
        const existingAdmin = await this.userModel
          .findOne({
            company: companyId,
            $or: [
              ...(adminUser.email ? [{ email: adminUser.email }] : []),
              ...(adminUser.username ? [{ username: adminUser.username }] : []),
            ],
          })
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
            companyId,
            isSuperAdmin: true,
          },
          async () => {
            const admin = new this.userModel({
              ...adminUser,
              modules,
              roles,
              permissions,
              company: companyId,
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
      const moduleCount = await this.moduleModel.countDocuments().exec();
      const permissionsCount = await this.permissionsModel
        .countDocuments()
        .exec();
      const rolCount = await this.rolModel.countDocuments().exec();
      const companyCount = await this.companyModel.countDocuments().exec();

      const company = await this.companyModel
        .findOne({ name: 'BPONET' })
        .exec();

      if (moduleCount === 0) {
        this.logger.warn('No modules found, creating initial modules...');
        await this.createInitModules();
      }

      if (permissionsCount === 0) {
        this.logger.warn(
          'No permissions found, creating initial permissions...',
        );
        await this.createInitPermissions();
      }

      if (rolCount === 0) {
        this.logger.warn('No roles found, creating initial roles...');
        await this.createInitRoles();
      }

      if (companyCount === 0) {
        this.logger.warn('No companies found, creating initial company...');
        await this.createInitCompanies();
      }

      const bponetCompany =
        company || (await this.companyModel.findOne({ name: 'BPONET' }).exec());

      if (!bponetCompany) {
        this.logger.error(
          'BPONET company does not exist after initialization. Admin users were not created.',
        );
        return;
      }

      let adminExists = false;

      for (const adminUser of ADMIN_USER) {
        const existingAdmin = await this.userModel
          .findOne({
            company: String(bponetCompany._id),
            $or: [
              ...(adminUser.email ? [{ email: adminUser.email }] : []),
              ...(adminUser.username ? [{ username: adminUser.username }] : []),
            ],
          })
          .exec();

        if (existingAdmin) {
          adminExists = true;
          break;
        }
      }

      if (!adminExists) {
        this.logger.warn(
          'BPONET admin user was not found, creating initial admin user...',
        );
        await this.createAdminUsers();
      } else {
        this.logger.log('BPONET admin user already exists, skipping creation.');
      }
    } catch (error) {
      this.logger.error('Error validating if data exists', error);
    }
  }
}
