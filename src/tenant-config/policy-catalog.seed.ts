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
>;

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
  text('general.timezone', 'Zona horaria', 'general', 'America/Bogota', 1),
  text('general.locale', 'Idioma/Región', 'general', 'es-CO', 2),

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
  bool('channels.whatsapp.enabled', 'WhatsApp habilitado', 'channels', true, 12),
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

  // Mensajes (Bolsa)
  num(
    'messages.texto.limit',
    'Mensajes de texto',
    'messages',
    3000,
    20,
    '0 = ilimitado',
    'mensajes/mes',
  ),
  num(
    'messages.audio.limit',
    'Mensajes de audio',
    'messages',
    1000,
    21,
    '0 = ilimitado',
    'mensajes/mes',
  ),
  num('messages.bolsa.utilidad', 'Bolsa - Utilidad', 'messages', 1000, 22, '', 'mensajes'),
  num(
    'messages.bolsa.marketingComercial',
    'Bolsa - Marketing/Comercial',
    'messages',
    1000,
    23,
    '',
    'mensajes',
  ),
  num(
    'messages.bolsa.autenticacion',
    'Bolsa - Autenticación',
    'messages',
    1000,
    24,
    '',
    'mensajes',
  ),
  num('messages.bolsa.servicio', 'Bolsa - Servicio', 'messages', 1000, 25, '', 'mensajes'),

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
  num('limits.maxAgents', 'Máx. agentes', 'limits', 50, 53),
  num('limits.maxChatbotFlows', 'Máx. flujos de chatbot', 'limits', 20, 54),
];
