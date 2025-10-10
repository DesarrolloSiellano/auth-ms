import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fsExtra from 'fs-extra';
import * as path from 'path';

async function bootstrap() {

  // Antes de crear la app, copia la carpeta de templates si no existe en dist
  const srcTemplates = path.resolve(process.cwd(), 'src', 'mail', 'templates');
  const distTemplates = path.resolve(process.cwd(), 'dist', 'mail', 'templates');
  const exists = await fsExtra.pathExists(distTemplates);
  if (!exists) {
    try {
      await fsExtra.copy(srcTemplates, distTemplates);
      console.log('Templates copiados desde src/mail/templates a dist/mail/templates');
    } catch (err) {
      console.error('Error copiando templates:', err);
      // Opcional: decidir si abortar arranque o continuar
    }
  } else {
    console.log('Templates ya existen en dist/mail/templates');
  }


  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Prefijo global para API REST
  app.setGlobalPrefix('api');

  // Configuración de CORS
  app.enableCors({
    origin: configService.get<string>('CORS_ORIGIN', '*'),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  });

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

Este enfoque permite un diseño modular, escalable y flexible, aprovechando lo mejor de los APIs REST para consumo público y microservicios TCP para comunicación interna.`
  )
  .addBearerAuth({
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Ingrese el token JWT en formato Bearer',
  })
  .build();


  const document = SwaggerModule.createDocument(app, swaggerConfig);
  document.servers = [{ url: '/auth/' }];
  SwaggerModule.setup('api-docs', app, document); // http://localhost:PORT/api-docs

  // Microservicio TCP
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: configService.get<string>('MICROSERVICE_HOST', '127.0.0.1'),
      port: configService.get<number>('MICROSERVICE_PORT', 3011),
    },
  });

  // Inicializa microservicio y servidor HTTP
  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3010);

  console.log(`Servidor REST: ${await app.getUrl()}`);
  console.log(`Swagger docs: ${await app.getUrl()}/api-docs`);
}
bootstrap();
