import { CanActivate, ExecutionContext, Injectable, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

@Injectable()
export class ValidateObjectIdGuard implements CanActivate {

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    
    // Obtenemos el parámetro 'id' de la ruta (ajusta si usas otro nombre)
    const id = request.params.id;

    if (!id) {
      throw new BadRequestException('ID parameter is required');
    }

    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    return true; // Permite continuar la ejecución si el id es válido
  }
}
