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
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const matchRoute = (a: any, b: any): boolean =>
  (a?.path && a.path === b?.path) || (a?.name && a.name === b?.name);

/** Fusiona los hijos del catálogo dentro de las rutas existentes (sin borrar). */
function mergeChildren(existing: any[], catalog: any[]): {
  children: any[];
  changed: boolean;
} {
  let changed = false;
  const children = [...(existing || [])];
  for (const catChild of catalog || []) {
    if (!children.some((c) => matchRoute(c, catChild))) {
      children.push(deepClone(catChild));
      changed = true;
    }
  }
  return { children, changed };
}

/** Fusiona rutas del catálogo dentro de las existentes (preserva las propias). */
function mergeRoutes(existing: any[], catalog: any[]): {
  routes: any[];
  changed: boolean;
} {
  let changed = false;
  const routes = [...(existing || [])];
  for (const catRoute of catalog || []) {
    const match = routes.find((r) => matchRoute(r, catRoute));
    if (!match) {
      routes.push(deepClone(catRoute));
      changed = true;
      continue;
    }
    const { children, changed: childChanged } = mergeChildren(
      match.children || [],
      catRoute.children || [],
    );
    if (childChanged) {
      match.children = children;
      changed = true;
    }
  }
  return { routes, changed };
}

/** Fusiona módulos del catálogo dentro de los módulos del usuario. */
function mergeModuleCatalog(existing: any[], catalog: any[]): {
  modules: any[];
  changed: boolean;
} {
  let changed = false;
  const modules = (existing || []).map((m) => deepClone(m));
  for (const catModule of catalog || []) {
    const target = modules.find(
      (m) => m.name === catModule.name || String(m._id) === String(catModule._id),
    );
    if (!target) {
      modules.push(deepClone(catModule));
      changed = true;
      continue;
    }
    const { routes, changed: routesChanged } = mergeRoutes(
      target.routes || target.router || [],
      catModule.routes || [],
    );
    if (routesChanged) {
      target.routes = routes;
      changed = true;
    }
  }
  return { modules, changed };
}

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
    private readonly tenantConfigService: TenantConfigService,
  ) {}

  async createInitModules() {
    try {
      for (const moduleItem of ADMIN_MODULE) {
        const moduleExists = await this.moduleModel
          .findOne({ name: moduleItem.name })
          .lean()
          .exec();

        if (moduleExists) {
          // Mantiene sincronizadas las rutas del catálogo en módulos existentes
          // (p. ej. nuevas opciones de menú) sin borrar rutas propias.
          const { routes, changed } = mergeRoutes(
            (moduleExists as any).routes || [],
            moduleItem.routes || [],
          );
          if (changed) {
            await this.moduleModel.updateOne(
              { _id: moduleExists._id },
              { $set: { routes } },
            );
            this.logger.log(
              `Module ${moduleItem.name}: rutas actualizadas (nuevas opciones).`,
            );
          } else {
            this.logger.warn(
              `Module ${moduleItem.name} already exists, skipping.`,
            );
          }
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

  /**
   * Sincroniza las rutas del catálogo dentro de los módulos embebidos de los
   * usuarios admin por defecto, para que nuevas opciones de menú (p. ej.
   * /tenant-config) aparezcan sin tener que recrear el usuario.
   */
  async syncAdminUserModules() {
    try {
      const catalogModules = await this.moduleModel.find().lean().exec();
      if (!catalogModules || catalogModules.length === 0) return;

      for (const adminUser of ADMIN_USER) {
        const existingAdmin = await this.userModel
          .findOne({
            $or: [
              ...(adminUser.email ? [{ email: adminUser.email }] : []),
              ...(adminUser.username
                ? [{ username: adminUser.username }]
                : []),
            ],
          })
          .lean()
          .exec();
        if (!existingAdmin) continue;

        const { modules, changed } = mergeModuleCatalog(
          (existingAdmin as any).modules || [],
          catalogModules as any[],
        );
        if (changed) {
          await this.userModel.updateOne(
            { _id: (existingAdmin as any)._id },
            { $set: { modules } },
          );
          this.logger.log(
            `Rutas de módulos sincronizadas para ${
              adminUser.email || adminUser.username
            }.`,
          );
        }
      }
    } catch (error) {
      this.logger.error('Error syncing admin user modules', error);
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
       * Catálogo de políticas + configuración por defecto del tenant
       */
      this.logger.log('Validating tenant policies catalog...');
      await this.tenantConfigService.seedDefaultCatalog();
      await this.tenantConfigService.ensureConfig(
        String(bponetCompany.id),
        String(bponetCompany.name),
      );

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

      /**
       * Sincronizar rutas nuevas (p. ej. /tenant-config) en admins existentes
       */
      await this.syncAdminUserModules();

      this.logger.log('Initial data validation completed successfully.');
    } catch (error) {
      this.logger.error('Error validating initial data', error);
    }
  }
}
