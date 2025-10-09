import { Injectable } from '@nestjs/common';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class AuthorizationService {
  /**
   * Verifica si el usuario puede ejecutar la acción requerida según roles y permisos activos.
   * @param user Usuario completo de la DB
   * @param action Acción a validar: 'create', 'read', etc.
   */

  canPerformAction(user: User, action: string): boolean {
    if (!user || !user.roles || user.roles.length === 0) return false;

    // Buscar en roles activos un permiso activo con la acción requerida
    for (const role of user.roles) {
      if (!role.isActive) continue;
      for (const perm of role.permissions || []) {
        if (
          perm.isActive &&
          perm.action &&
          perm.action.toLowerCase() === action.toLowerCase()
        ) {
          return true;
        }
      }
    }

    // Si tienes un array global de permisos en el usuario, revisa ahí también:
    for (const perm of user.permissions || []) {
      if (
        perm.isActive &&
        perm.action &&
        perm.action.toLowerCase() === action.toLowerCase()
      ) {
        return true;
      }
    }

    // Si llega aquí, no tiene permisos suficientes
    return false;
  }

}
