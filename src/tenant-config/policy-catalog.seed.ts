import { PolicyDefinition } from './entities/policy-definition.entity';

type SeedPolicy = Pick<
  PolicyDefinition,
  | 'key'
  | 'label'
  | 'description'
  | 'group'
  | 'type'
  | 'defaultValue'
  | 'unit'
  | 'order'
  | 'isSystem'
  | 'options'
>;

export const TIMEZONE_OPTIONS = [
  { label: 'Colombia (America/Bogota)', value: 'America/Bogota' },
  { label: 'México (America/Mexico_City)', value: 'America/Mexico_City' },
  { label: 'Perú (America/Lima)', value: 'America/Lima' },
  { label: 'Chile (America/Santiago)', value: 'America/Santiago' },
  {
    label: 'Argentina (America/Argentina/Buenos_Aires)',
    value: 'America/Argentina/Buenos_Aires',
  },
  { label: 'Brasil (America/Sao_Paulo)', value: 'America/Sao_Paulo' },
  { label: 'Ecuador (America/Guayaquil)', value: 'America/Guayaquil' },
  { label: 'Venezuela (America/Caracas)', value: 'America/Caracas' },
  { label: 'Panamá (America/Panama)', value: 'America/Panama' },
  {
    label: 'Costa Rica (America/Costa_Rica)',
    value: 'America/Costa_Rica',
  },
  { label: 'Nueva York (America/New_York)', value: 'America/New_York' },
  { label: 'Los Ángeles (America/Los_Angeles)', value: 'America/Los_Angeles' },
  { label: 'España (Europe/Madrid)', value: 'Europe/Madrid' },
  { label: 'UTC', value: 'UTC' },
];

export const LOCALE_OPTIONS = [
  { label: 'Español (Colombia) - es-CO', value: 'es-CO' },
  { label: 'Español (México) - es-MX', value: 'es-MX' },
  { label: 'Español (Argentina) - es-AR', value: 'es-AR' },
  { label: 'Español (Chile) - es-CL', value: 'es-CL' },
  { label: 'Español (Perú) - es-PE', value: 'es-PE' },
  { label: 'Español (España) - es-ES', value: 'es-ES' },
  { label: 'Inglés (EE. UU.) - en-US', value: 'en-US' },
  { label: 'Portugués (Brasil) - pt-BR', value: 'pt-BR' },
];

const num = (
  key: string,
  label: string,
  group: string,
  defaultValue: number,
  order: number,
  description = '',
  unit = '',
): SeedPolicy => ({
  key,
  label,
  description,
  group,
  type: 'number',
  defaultValue,
  unit,
  order,
  isSystem: true,
});

const bool = (
  key: string,
  label: string,
  group: string,
  defaultValue: boolean,
  order: number,
  description = '',
): SeedPolicy => ({
  key,
  label,
  description,
  group,
  type: 'boolean',
  defaultValue,
  unit: '',
  order,
  isSystem: true,
});

const select = (
  key: string,
  label: string,
  group: string,
  defaultValue: string,
  options: { label: string; value: any }[],
  order: number,
  description = '',
): SeedPolicy => ({
  key,
  label,
  description,
  group,
  type: 'select',
  defaultValue,
  unit: '',
  options,
  order,
  isSystem: true,
});

const text = (
  key: string,
  label: string,
  group: string,
  defaultValue: string,
  order: number,
  description = '',
): SeedPolicy => ({
  key,
  label,
  description,
  group,
  type: 'text',
  defaultValue,
  unit: '',
  order,
  isSystem: true,
});

/**
 * Catálogo semilla de políticas. Estas definiciones se siembran en
 * `policy_definitions` (el SuperAdmin puede editarlas o crear nuevas).
 */
export const POLICY_CATALOG_SEED: SeedPolicy[] = [
  // General
  select(
    'general.timezone',
    'Zona horaria',
    'general',
    'America/Bogota',
    TIMEZONE_OPTIONS,
    1,
    'Zona horaria para visualización de fechas (auditoría, correos, reportes).',
  ),
  select(
    'general.locale',
    'Idioma/Región',
    'general',
    'es-CO',
    LOCALE_OPTIONS,
    2,
    'Locale para visualización de fechas.',
  ),

  // Canales
  bool('channels.sms.enabled', 'SMS habilitado', 'channels', true, 10),
  num(
    'channels.sms.monthlyLimit',
    'SMS por mes',
    'channels',
    3000,
    11,
    '0 = ilimitado',
    'mensajes/mes',
  ),
  bool(
    'channels.whatsapp.enabled',
    'WhatsApp API de plataforma',
    'channels',
    false,
    12,
    'Si está deshabilitado, la empresa configura su propia API de WhatsApp (BYO). Si se habilita, la plataforma provee el API y aplican las bolsas/límites de WhatsApp.',
  ),
  text(
    'channels.whatsapp.platformPhoneNumberId',
    'WhatsApp plataforma - Phone Number ID',
    'channels',
    '',
    12.1,
    'Phone Number ID de WhatsApp que la plataforma asigna a la empresa (solo aplica si el API de plataforma está habilitado).',
  ),
  text(
    'channels.whatsapp.platformDisplayNumber',
    'WhatsApp plataforma - Número visible',
    'channels',
    '',
    12.2,
    'Número visible de WhatsApp que la plataforma asigna a la empresa.',
  ),
  num(
    'channels.whatsapp.monthlyLimit',
    'WhatsApp por mes',
    'channels',
    0,
    13,
    '0 = ilimitado',
    'mensajes/mes',
  ),
  bool('channels.audio.enabled', 'Audio habilitado', 'channels', true, 14),
  num(
    'channels.audio.monthlyLimit',
    'Audio por mes',
    'channels',
    1000,
    15,
    '0 = ilimitado',
    'mensajes/mes',
  ),
  bool('channels.email.enabled', 'Correo habilitado', 'channels', true, 16),
  num(
    'channels.email.monthlyLimit',
    'Correo por mes',
    'channels',
    0,
    17,
    '0 = ilimitado',
    'correos/mes',
  ),

  // Mensajes (Bolsas por categoría). El audio se controla por `channels.audio.*`.
  // 0 = ilimitado; cuando la bolsa global (`channels.whatsapp.monthlyLimit`) > 0
  // las bolsas deben sumar exactamente la global.
  num(
    'messages.bolsa.utilidad',
    'Bolsa - Utilidad',
    'messages',
    0,
    22,
    '0 = ilimitado',
    'mensajes',
  ),
  num(
    'messages.bolsa.marketingComercial',
    'Bolsa - Marketing/Comercial',
    'messages',
    0,
    23,
    '0 = ilimitado',
    'mensajes',
  ),
  num(
    'messages.bolsa.autenticacion',
    'Bolsa - Autenticación',
    'messages',
    0,
    24,
    '0 = ilimitado',
    'mensajes',
  ),
  num(
    'messages.bolsa.servicio',
    'Bolsa - Servicio',
    'messages',
    0,
    25,
    '0 = ilimitado',
    'mensajes',
  ),

  // Features (entitlements)
  bool('features.georreferenciacion', 'Georreferenciación', 'features', true, 34),
  bool('features.whatsappIntegration', 'Integración WhatsApp', 'features', true, 35),
  bool('features.qr', 'QR', 'features', true, 36),
  bool('features.botAutomatizado', 'Bot automatizado', 'features', true, 38),
  bool('features.chatbot', 'Chatbot (opciones)', 'features', false, 39),
  bool('features.ia', 'IA', 'features', false, 40),
  bool('features.whatsappCrm', 'WhatsApp + CRM', 'features', true, 41),
  bool(
    'features.transferenciaAsesor',
    'Transferencia a asesor',
    'features',
    true,
    42,
  ),
  bool('features.pbx', 'Integración PBX', 'features', false, 43),
  bool('features.notificaciones', 'Notificaciones', 'features', true, 44),
  bool(
    'features.atencionSalidaMensajes',
    'Atención y salida de mensajes',
    'features',
    true,
    45,
  ),
  bool('features.pqrs', 'PQRS', 'features', true, 46),
  bool('features.userTags', 'Etiquetas de usuario', 'features', true, 47),
  bool('features.userGroups', 'Grupos de usuario', 'features', true, 48),
  bool('features.customFields', 'Campos personalizados', 'features', true, 49),
  bool('features.invitations', 'Invitaciones por correo', 'features', true, 50),

  // Seguridad
  num(
    'security.maxFailedAttempts',
    'Intentos fallidos permitidos',
    'security',
    3,
    70,
    '0 = sin bloqueo automático',
  ),
  num(
    'security.lockMinutes',
    'Minutos de bloqueo temporal',
    'security',
    15,
    71,
  ),

  // Preferencias de notificación
  bool('preferences.notifications', 'Notificaciones', 'preferences', true, 60),
  bool(
    'preferences.notifications.newLogin',
    'Aviso de nuevo inicio de sesión',
    'preferences',
    true,
    61,
  ),

  // Límites
  num('limits.maxUsers', 'Máx. usuarios', 'limits', 0, 50, '0 = ilimitado'),
  num('limits.maxStorageMb', 'Máx. almacenamiento', 'limits', 0, 52, '0 = ilimitado', 'MB'),
  // Tope por rol. Se crea una política `limits.roles.<CODE>` por cada rol.
  num('limits.roles.AGE', 'Máx. agentes', 'limits', 50, 53, '0 = ilimitado'),
  num('limits.maxChatbotFlows', 'Máx. flujos de chatbot', 'limits', 20, 55),
  num(
    'limits.trialDays',
    'Días de prueba',
    'limits',
    7,
    56,
    'Días del período de prueba (>0). Por defecto 7, igual que TEST_USER_DAYS',
  ),
];
