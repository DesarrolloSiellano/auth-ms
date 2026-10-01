import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

/** Mensajes amigables para errores de unicidad de Mongo, sin exponer índices. */
const DUPLICATE_FIELD_MESSAGES: Record<string, string> = {
  email: 'El correo ya está registrado',
  username: 'El nombre de usuario ya está en uso',
  phone: 'El teléfono ya está registrado',
};

const GENERIC_500_MESSAGE = 'Error interno al procesar la solicitud';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const isRpc = host.getType() === 'rpc';
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request?.headers?.['x-request-id'] as string) ||
      (request as any)?.id ||
      randomUUID();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message =
      exception instanceof HttpException
        ? exception.getResponse()
        : exception.message || 'Internal server error';

    // Manejo de errores de duplicado de MongoDB: mensaje amigable por campo,
    // sin exponer colección/índice.
    if (exception?.code === 11000) {
      status = HttpStatus.CONFLICT;
      const field = Object.keys(
        exception.keyValue || exception.keyPattern || {},
      )[0];
      message =
        DUPLICATE_FIELD_MESSAGES[field] ||
        'Ya existe un registro con esos datos';
    } else if (!(exception instanceof HttpException)) {
      // Errores no controlados: no filtrar detalles internos al cliente.
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = GENERIC_500_MESSAGE;
    }

    // Estructurar el mensaje si es un objeto (procedente de NestJS ValidationPipe por ejemplo)
    const errorResponse = typeof message === 'object' ? message : { message };

    // Propaga campos estructurados opcionales (p. ej. login: code/errors).
    const extra: Record<string, any> = {};
    if (errorResponse && typeof errorResponse === 'object') {
      if (errorResponse['code'] !== undefined) {
        extra.code = errorResponse['code'];
      }
      if (errorResponse['errors'] !== undefined) {
        extra.errors = errorResponse['errors'];
      }
    }

    this.logger.error(
      `[${requestId}] ${isRpc ? 'RPC' : 'HTTP'} Status: ${status} Error Message: ${JSON.stringify(
        errorResponse,
      )}`,
      exception?.stack,
    );

    const errorBody = {
      message: errorResponse['message'] || message,
      ...extra,
      ...(!isRpc && { statusCode: status }),
      status: 'Error',
      data: null,
      requestId,
      meta: {
        timestamp: new Date().toISOString(),
        ...(!isRpc && { path: request?.url }),
      },
    };

    if (isRpc) {
      return errorBody;
    }

    response.status(status).json(errorBody);
  }
}
