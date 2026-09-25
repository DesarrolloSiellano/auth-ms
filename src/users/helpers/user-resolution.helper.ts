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

/**
 * Devuelve el primer valor booleano definido (ignora null/undefined).
 * Si ninguno está definido, usa `defaultValue`.
 */
function resolveActive(
  candidates: any[],
  defaultValue = true,
): boolean {
  for (const value of candidates) {
    if (value === true) return true;
    if (value === false) return false;
  }
  return defaultValue;
}

function matchRoute(a: any, b: any): boolean {
  if (!a || !b) return false;
  return (
    (a.path !== undefined && a.path === b.path) ||
    (a.name !== undefined && a.name === b.name)
  );
}

/**
 * Resuelve los hijos de una ruta. Si el payload define hijos, ese es el
 * conjunto deseado (se respeta su `isActive`); si no, se usan los del catálogo.
 */
function resolveChildren(globalChildren: any[], payloadChildren?: any[]): any[] {
  const global = globalChildren || [];

  if (Array.isArray(payloadChildren)) {
    return payloadChildren.map((payloadChild) => {
      const globalChild = global.find((gc: any) => matchRoute(payloadChild, gc));
      const base = globalChild || payloadChild;
      return {
        ...base,
        isActive: resolveActive(
          [payloadChild?.isActive, globalChild?.isActive],
          true,
        ),
      };
    });
  }

  return global.map((globalChild) => ({
    ...globalChild,
    isActive: resolveActive([globalChild?.isActive], true),
  }));
}

/**
 * El padre es contenedor: si tiene hijos, su estado se deriva de ellos;
 * si no, se usa el primer valor definido del payload/catálogo.
 */
function deriveParentActive(children: any[], fallbacks: any[]): boolean {
  if (children.length > 0) {
    return children.some((c: any) => c.isActive === true);
  }
  return resolveActive(fallbacks, true);
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
        const filteredRoutes = (globalModule.routes || [])
          .map((globalRoute: any) => {
            const isParentAllowed =
              allowedPaths.includes(globalRoute.path) ||
              allowedPaths.includes(globalRoute.name);

            const children = (globalRoute.children || []).map((child: any) => ({
              ...child,
              isActive:
                isParentAllowed ||
                allowedPaths.includes(child.path) ||
                allowedPaths.includes(child.name),
            }));

            const isAnyChildAllowed = children.some(
              (c: any) => c.isActive === true,
            );

            if (isParentAllowed || isAnyChildAllowed) {
              return {
                ...globalRoute,
                isActive: deriveParentActive(children, [isParentAllowed]),
                children,
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
            const globalRoutes: any[] = globalModule.routes || [];
            const payloadRoutes: any[] = modPayload.routes;

            // El payload define el conjunto deseado de rutas del usuario.
            const filteredRoutes = payloadRoutes.map((payloadRoute: any) => {
              const globalRoute = globalRoutes.find((globalRoute: any) =>
                matchRoute(payloadRoute, globalRoute),
              );
              const base = globalRoute || payloadRoute;
              const children = resolveChildren(
                base.children || [],
                payloadRoute.children,
              );
              return {
                ...base,
                isActive: deriveParentActive(children, [
                  payloadRoute.isActive,
                  globalRoute?.isActive,
                ]),
                children,
              };
            });

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
