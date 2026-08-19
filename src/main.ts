import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { Logger } from 'nestjs-pino';
import * as fsExtra from 'fs-extra';
import * as path from 'path';

export async function bootstrap() {
  // Antes de crear la app, copia la carpeta de templates si no existe en dist
  const srcTemplates = path.resolve(process.cwd(), 'src', 'mail', 'templates');
  const distTemplates = path.resolve(
    process.cwd(),
    'dist',
    'mail',
    'templates',
  );
  const exists = await fsExtra.pathExists(distTemplates);
  if (!exists) {
    try {
      await fsExtra.copy(srcTemplates, distTemplates);
      console.log(
        'Templates copiados desde src/mail/templates a dist/mail/templates',
      );
    } catch (err) {
      console.error('Error copiando templates:', err);
      // Opcional: decidir si abortar arranque o continuar
    }
  } else {
    console.log('Templates ya existen en dist/mail/templates');
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  const configService = app.get(ConfigService);

  // Prefijo global para API REST
  app.setGlobalPrefix('api');

  // Configuración de CORS
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');
  const corsOrigins =
    corsOrigin === '*'
      ? corsOrigin
      : corsOrigin
          .split(',')
          .map((o) => o.trim())
          .filter((o) => o !== '');
  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization', 'x-idempotency-key'],
    credentials: false,
  });

  // Global Filters (Interceptors are registered globally in AppModule)
  app.useGlobalFilters(new HttpExceptionFilter());

  // Validación global de entrada (DTOs). whitelist elimina campos no declarados
  // para prevenir over-posting / mass-assignment.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Swagger/OpenAPI Configuración
  const swaggerConfig = new DocumentBuilder()
    .setTitle('API Híbrida con REST y Microservicios TCP')
    .setVersion('1.0')
    .setDescription(
      `Esta es una aplicación híbrida desarrollada con NestJS que combina:

- **API REST:**  
  Expone endpoints HTTP documentados con Swagger para operaciones estándar accesibles por clientes externos, navegadores o herramientas REST.

- **Microservicios TCP:**  
  Utiliza comunicación interna mediante patrones de mensajes TCP para integrar microservicios de manera eficiente y escalable.  
  Estos microservicios no se exponen vía HTTP y no pueden ser consumidos directamente a través de Swagger UI.

La documentación Swagger incluye:  
- La descripción y ejemplos completos para todos los endpoints REST.  
- Documentación especial (a través de endpoints de solo lectura) que describe los patrones y payloads TCP disponibles para microservicios, como referencia para desarrolladores e integradores.

**Autenticación:**

1. **JWT de usuario (REST):** Header \`Authorization: Bearer <access_token>\`. El token contiene SOLO identidad
   (\`_id\`, \`name\`, \`email\`, \`company\`, \`tenantId\`, \`isSuperAdmin\`). El árbol de autorización
   (modules/roles/permissions) se obtiene vía \`GET /api/users/profile\`.
2. **Clave de servicio (REST opt-in):** header \`x-service-key\` (valor de \`SERVICE_API_KEY\`) en rutas como
   \`profile\` y \`findByTenant\` (más \`x-company-id\`/\`x-tenant-id\`/\`x-user-id\` según la ruta).
3. **Microservicios TCP:** todos los \`@MessagePattern\` exigen \`serviceKey\` en el payload.

Este enfoque permite un diseño modular, escalable y flexible, aprovechando lo mejor de los APIs REST para consumo público y microservicios TCP para comunicación interna.`,
    )
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Ingrese el token JWT en formato Bearer',
    })
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document); // http://localhost:PORT/api-docs

  // Microservicio TCP (con TLS/mTLS opcional vía entorno)
  const tlsEnabled = configService.get<string>('TLS_ENABLED', 'false') === 'true';
  const tlsMutual = configService.get<string>('TLS_MUTUAL', 'false') === 'true';

  let tlsOptions: any;
  if (tlsEnabled) {
    const keyPath = configService.get<string>('TLS_KEY_PATH');
    const certPath = configService.get<string>('TLS_CERT_PATH');
    const caPath = configService.get<string>('TLS_CA_PATH');

    if (!keyPath || !certPath) {
      throw new Error(
        'TLS_ENABLED=true requiere TLS_KEY_PATH y TLS_CERT_PATH configurados',
      );
    }

    tlsOptions = {
      key: fsExtra.readFileSync(keyPath),
      cert: fsExtra.readFileSync(certPath),
      ...(caPath ? { ca: fsExtra.readFileSync(caPath) } : {}),
      requestCert: tlsMutual,
      rejectUnauthorized: tlsMutual,
    };
  }

  app.connectMicroservice<MicroserviceOptions>(
    {
      transport: Transport.TCP,
      options: {
        host: configService.get<string>('MICROSERVICE_HOST', '127.0.0.1'),
        port: configService.get<number>('MICROSERVICE_PORT', 3011),
        ...(tlsEnabled && tlsOptions ? { tls: tlsOptions } : {}),
      },
    },
    { inheritAppConfig: true },
  );

  // Inicializa microservicio y servidor HTTP
  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3010);

  logger.log(`Servidor REST: ${await app.getUrl()}`);
  logger.log(`Swagger docs: ${await app.getUrl()}/api-docs`);
}

// Solo se ejecuta cuando se lanza directamente (node dist/main), no al importar.
if (require.main === module) {
  bootstrap();
}
