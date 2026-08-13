import { Model } from 'mongoose';
import { Logger } from '@nestjs/common';

const logger = new Logger('UserResolution');

export async function resolveUserRoles(
  payload: any,
  rolModel: Model<any>,
): Promise<any[]> {
  const userRoles: any[] = [];
  try {
    let inputRoles: { roleCode: string; roleName: string }[] = [];

    if (payload.roles && Array.isArray(payload.roles)) {
      inputRoles = payload.roles
        .map((r: any) => {
          if (typeof r === 'string') {
            return {
              roleCode: r,
              roleName: r,
            };
          }
          return {
            roleCode: r.roleCode || r.codeRol || r.code,
            roleName:
              r.roleName ||
              r.name ||
              `Rol para ${r.roleCode || r.codeRol || r.code}`,
          };
        })
        .filter((r) => !!r.roleCode);
    } else if (payload.roleCode) {
      inputRoles.push({
        roleCode: payload.roleCode,
        roleName: payload.roleName || `Rol para ${payload.roleCode}`,
      });
    }

    const roleCodes = inputRoles.map((r) => r.roleCode);
    const existingRoles = await rolModel
      .find({ codeRol: { $in: roleCodes } })
      .exec();

    for (const inputRol of inputRoles) {
      let rolObj = existingRoles.find((r) => r.codeRol === inputRol.roleCode);
      if (!rolObj) {
        const newRol = new rolModel({
          name: inputRol.roleName,
          codeRol: inputRol.roleCode,
          description: `Rol para ${inputRol.roleCode}`,
          isActive: true,
          isInheritPermissions: false,
          permissions: [],
        });
        rolObj = await newRol.save();
      }
      userRoles.push({
        name: rolObj.name,
        codeRol: rolObj.codeRol,
        description: rolObj.description,
        isActive: rolObj.isActive,
        isInheritPermissions: rolObj.isInheritPermissions,
        permissions: rolObj.permissions || [],
      });
    }
  } catch (error) {
    logger.error(`Error resolving roles: ${error?.message}`, error?.stack);
  }
  return userRoles;
}

export async function resolveUserPermissions(
  payload: any,
  permissionModel: Model<any>,
): Promise<any[]> {
  const userPermissions: any[] = [];
  try {
    const permissionNames: string[] = (payload.permissions || [])
      .map((p: any) => (p || '').trim())
      .filter((p: string) => p !== '');

    for (const name of permissionNames) {
      // Buscar de forma insensible a mayúsculas y minúsculas
      let permObj: any = await permissionModel
        .findOne({
          name: { $regex: new RegExp(`^${name}$`, 'i') },
        })
        .exec();

      if (!permObj) {
        // Normalizamos el nombre a primera letra mayúscula para coherencia
        const normalizedName =
          name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

        // Segunda verificación con el nombre exacto normalizado
        permObj = await permissionModel
          .findOne({ name: normalizedName })
          .exec();

        if (!permObj) {
          const newPerm = new permissionModel({
            name: normalizedName,
            description: `Permiso para ${normalizedName}`,
            action: normalizedName.toLowerCase(),
            resource: normalizedName.toLowerCase(),
            type: 'global',
            isActive: true,
          });
          permObj = await newPerm.save();
        }
      }

      if (permObj && permObj.isActive) {
        userPermissions.push({
          name: permObj.name,
          description: permObj.description,
          action: permObj.action,
          isActive: permObj.isActive,
        });
      }
    }
  } catch (error) {
    logger.error(`Error resolving permissions: ${error?.message}`, error?.stack);
  }
  return userPermissions;
}

export async function resolveUserModules(
  payload: any,
  moduleModel: Model<any>,
): Promise<any[]> {
  const userModules: any[] = [];
  try {
    const targetModuleName = payload.allowNameModule || payload.moduleName;

    if (payload.allowedRoutes && Array.isArray(payload.allowedRoutes)) {
      const globalModule: any = await moduleModel
        .findOne({
          name: targetModuleName,
          isActive: true,
        })
        .lean()
        .exec();

      if (globalModule) {
        const allowedPaths = payload.allowedRoutes;
        const filteredRoutes = globalModule.routes
          .map((globalRoute: any) => {
            const isParentAllowed = allowedPaths.includes(globalRoute.path);

            let filteredChildren = [];
            if (globalRoute.children && Array.isArray(globalRoute.children)) {
              filteredChildren = globalRoute.children
                .filter(
                  (child: any) =>
                    allowedPaths.includes(child.path) || isParentAllowed,
                )
                .map((child: any) => ({
                  ...child,
                  isActive: true,
                }));
            }

            const isAnyChildAllowed = filteredChildren.length > 0;

            if (isParentAllowed || isAnyChildAllowed) {
              return {
                ...globalRoute,
                isActive: true,
                children: filteredChildren,
              };
            }
            return null;
          })
          .filter((r: any) => r !== null);

        userModules.push({
          ...globalModule,
          routes: filteredRoutes,
        });
      }
    } else if (payload.modules && Array.isArray(payload.modules)) {
      for (const modPayload of payload.modules) {
        const globalModule: any = await moduleModel
          .findOne({
            name: modPayload.name,
            isActive: true,
          })
          .lean()
          .exec();

        if (globalModule) {
          if (modPayload.routes && Array.isArray(modPayload.routes)) {
            const filteredRoutes = globalModule.routes
              .map((globalRoute: any) => {
                const payloadRoute = modPayload.routes.find(
                  (r: any) => r.path === globalRoute.path,
                );
                if (!payloadRoute) return null;

                let filteredChildren = [];
                if (
                  globalRoute.children &&
                  Array.isArray(globalRoute.children) &&
                  payloadRoute.children &&
                  Array.isArray(payloadRoute.children)
                ) {
                  filteredChildren = globalRoute.children.filter(
                    (globalChild: any) =>
                      payloadRoute.children.some(
                        (c: any) => c.path === globalChild.path,
                      ),
                  );
                }

                return {
                  ...globalRoute,
                  isActive:
                    payloadRoute.isActive !== undefined
                      ? payloadRoute.isActive
                      : globalRoute.isActive,
                  children: filteredChildren,
                };
              })
              .filter((r: any) => r !== null);

            userModules.push({
              ...globalModule,
              routes: filteredRoutes,
            });
          } else {
            userModules.push(globalModule);
          }
        } else {
          userModules.push(modPayload);
        }
      }
    }

    if (userModules.length === 0) {
      const activeModules: any[] = await moduleModel
        .find({ isActive: true })
        .lean()
        .exec();
      userModules.push(...activeModules);
    }
  } catch (error) {
    logger.error(`Error resolving modules: ${error?.message}`, error?.stack);
  }
  return userModules;
}
