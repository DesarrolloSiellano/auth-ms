# Funcionalidades para el usuario / admin — Ideas y backlog

Lista de funcionalidades orientadas al usuario y al administrador para la
plataforma de autenticación. Se apoya en lo ya existente (usuarios,
roles/permisos/módulos, empresas, sesiones, políticas/uso por tenant, dashboard).
Se marcan como **(quick win)** las que aprovechan capacidades ya construidas.

## 1. Reportes y exportaciones
- **(quick win)** Reporte de usuarios con filtros (empresa, rol, estado, rango de fechas) y export a Excel/CSV/PDF.
- **(quick win)** Reporte de sesiones (activas e histórico) por usuario/empresa/IP/dispositivo/período.
- Reporte de accesos / auditoría (login OK/fallido, IP, dispositivo, hora).
- **(quick win)** Reporte de uso vs cuotas por empresa (consolidar el dashboard en Excel/PDF).
- Reporte de roles y permisos asignados (y usuarios por rol).
- Reporte de empresas (SuperAdmin) con métricas.
- Reporte de cambios de políticas/configuración (auditoría).
- Envío programado de reportes por correo (diario/semanal/mensual).

## 2. Autoservicio del usuario
- Mi perfil: editar datos, avatar, preferencias (idioma, zona horaria).
- **(quick win)** Mis sesiones/dispositivos: ver y cerrar mis propias sesiones.
- Mi historial de accesos (timeline de inicios de sesión).
- **(quick win)** Notificación de nuevo inicio de sesión por correo.
- Descargar mis datos (portabilidad) y solicitar eliminación de cuenta.
- Configurar MFA (cuando exista) y ver "estado de seguridad" de la cuenta.

## 3. Administración de usuarios
- Búsqueda avanzada (filtros combinados y guardados).
- **(quick win)** Acciones masivas: activar/desactivar, asignar roles/módulos, resetear contraseña, revocar sesiones, eliminar.
- **(quick win)** Exportar la lista filtrada y descargar plantilla de importación.
- Invitaciones por correo en vez de crear con contraseña.
- Reenviar correo de bienvenida/activación; forzar cambio de contraseña al próximo login.
- Bloquear/desbloquear usuarios y etiquetas/grupos de usuarios.
- Campos personalizados por empresa.

## 4. Empresas / SuperAdmin
- Dashboard global multi-empresa (comparativo de usuarios, sesiones, uso).
- **(quick win)** Consumo por empresa vs cuotas y alertas de cercanía al límite.
- Wizard de onboarding de empresa (datos + políticas por defecto).

## 5. Notificaciones y alertas
- Centro de notificaciones in-app y preferencias.
- Alertas de seguridad: picos de intentos fallidos, muchos dispositivos/IPs, sesión nueva.
- Plantillas de correo configurables por empresa (i18n/branding).

## 6. Experiencia de uso
- Búsqueda global (command palette) y tema claro/oscuro.
- Atajos de teclado y mejoras de accesibilidad.
- Vista de detalle de usuario (roles, módulos, sesiones, actividad en una sola pantalla).

## 7. Integraciones / API
- **(quick win)** Webhooks de eventos (`user.created`, `user.updated`, `user.deleted`). Nota: la revocación de sesiones **ya** se propaga sin webhooks, al validar el token (`validateUser`/`validateSession` en TCP y `JwtStrategy` en HTTP).
- API keys personales para usuarios/servicios.
- SSO/OIDC (ya en roadmap) y SCIM para provisionamiento.

## Recomendación por fases (bajo riesgo -> valor)
1. **Quick wins**: reportes de usuarios y sesiones (Excel/PDF), "Mis sesiones", notificación de nuevo login, uso vs cuotas, webhooks básicos.
2. **Admin**: acciones masivas, invitaciones, reenviar correo/forzar cambio, etiquetas/grupos.
3. **Autoservicio**: perfil, historial, portabilidad/eliminación, estado de seguridad.
4. **Empresas/SuperAdmin**: dashboard global y alertas de cuota.
5. **Notificaciones e integraciones**: centro in-app, plantillas por empresa, API keys.
