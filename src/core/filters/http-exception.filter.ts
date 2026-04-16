import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const isRpc = host.getType() === 'rpc';
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message =
      exception instanceof HttpException
        ? exception.getResponse()
        : exception.message || 'Internal server error';

    // Manejo específico para errores de MongoDB (ej. errores de duplicidad)
    if (exception.code === 11000) {
      status = HttpStatus.BAD_REQUEST;
      const field = Object.keys(exception.keyValue || {})[0];
      message = `Duplicate key error: ${field} already exists`;
    }

    // Estructurar el mensaje si es un objeto (procedente de NestJS ValidationPipe por ejemplo)
    const errorResponse = typeof message === 'object' ? message : { message };

    this.logger.error(
      `${isRpc ? 'RPC' : 'HTTP'} Status: ${status} Error Message: ${JSON.stringify(
        errorResponse,
      )}`,
      exception.stack,
    );

    const errorBody = {
      message: errorResponse['message'] || message,
      ...(!isRpc && { statusCode: status }),
      status: 'Error',
      data: null,
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
