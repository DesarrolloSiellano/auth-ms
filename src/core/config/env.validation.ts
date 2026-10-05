import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  MONGO_URI: Joi.string().required().messages({
    'any.required': 'MONGO_URI is mandatory to connect to the database',
  }),
  PORT: Joi.number().default(3010),
  JWT_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_EXPIRATION: Joi.string().default('1h'),
  JWT_ACCESS_EXPIRATION: Joi.string().default('1h'),
  JWT_REFRESH_EXPIRATION: Joi.string().default('7d'),
  JWT_ISSUER: Joi.string().default('bponet-auth'),
  JWT_AUDIENCE: Joi.string().default('bponet-apps'),
  MICROSERVICE_HOST: Joi.string().default('127.0.0.1'),
  MICROSERVICE_PORT: Joi.number().default(3011),

  // Mail Config
  EMAIL_HOST: Joi.string().required(),
  EMAIL_PORT: Joi.number().default(587),
  EMAIL_USERNAME: Joi.string().email().required(),
  EMAIL_PASSWORD: Joi.string().required(),

  // App Config
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test', 'provision')
    .default('development'),
  CORS_ORIGIN: Joi.string().default('*'),

  // SSO redirect whitelist (comma-separated allowed origins)
  SSO_ALLOWED_ORIGINS: Joi.string()
    .required()
    .messages({
      'any.required':
        'SSO_ALLOWED_ORIGINS is mandatory (comma-separated allowed redirect origins)',
    }),

  // Inter-service authentication (TCP + REST opt-in)
  SERVICE_API_KEY: Joi.string()
    .required()
    .messages({
      'any.required':
        'SERVICE_API_KEY is mandatory to authenticate inter-service calls',
    }),

  // TCP transport TLS / mTLS
  TLS_ENABLED: Joi.string().default('false'),
  TLS_KEY_PATH: Joi.string().allow('').optional(),
  TLS_CERT_PATH: Joi.string().allow('').optional(),
  TLS_CA_PATH: Joi.string().allow('').optional(),
  TLS_MUTUAL: Joi.string().default('false'),

  // Configuración de tenants: incluir tenantConfig en login/profile
  TENANT_CONFIG_EMBED_IN_AUTH: Joi.string().default('true'),

  // Reportes: tope de filas para exportación vía JSON (PDF en el frontend)
  REPORTS_EXPORT_MAX_ROWS: Joi.number().default(5000),

  // Retención de auditoría (días) para el índice TTL de audit_logs
  AUDIT_RETENTION_DAYS: Joi.number().default(180),

  // Días por defecto del período de prueba de usuarios (isTrial). 0 = sin expiración.
  TEST_USER_DAYS: Joi.number().min(0).default(7),

  // Caché de validez de sesión (ms) para revocación. 0 = sin caché (inmediato entre instancias).
  SESSION_CACHE_TTL_MS: Joi.number().min(0).default(30000),

  // Rate limiting del canal TCP (@MessagePattern). 'false' lo desactiva.
  RPC_THROTTLE_ENABLED: Joi.string().default('true'),
  RPC_THROTTLE_LOGIN: Joi.number().min(0).default(5),
  RPC_THROTTLE_REFRESH: Joi.number().min(0).default(10),
  RPC_THROTTLE_CHANGE_PASSWORD: Joi.number().min(0).default(10),
  RPC_THROTTLE_VALIDATE: Joi.number().min(0).default(6000),
  RPC_THROTTLE_DEFAULT: Joi.number().min(0).default(100),

  // Caché de usuario en la validación TCP (ms). 0 = sin caché.
  JWT_USER_CACHE_TTL_MS: Joi.number().min(0).default(5000),
});
