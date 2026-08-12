import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  MONGO_URI: Joi.string().required().messages({
    'any.required': 'MONGO_URI is mandatory to connect to the database',
  }),
  PORT: Joi.number().default(3010),
  JWT_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_EXPIRATION: Joi.string().default('30d'),
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
});
