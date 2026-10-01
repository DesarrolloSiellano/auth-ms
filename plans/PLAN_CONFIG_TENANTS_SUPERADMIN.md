# Configuración de Empresas/Tenants por Superadmin (Microservicio)

Documento de diseño para llevar al **microservicio externo**. Define cómo el
superadministrador configura las empresas/tenants desde el microservicio y cómo
la **aplicación educativa** consume esa configuración para aplicar límites y
zona horaria.

---

## 1. Objetivo

Centralizar en el microservicio (donde ya se crean las empresas/tenants y los
usuarios) la **configuración por empresa**:

- Límites de uso (p. ej. SMS por mes).
- Canales de notificación habilitados.
- Zona horaria (UTC) para el formato de fechas y horas.
- Otros límites/flags que se definan a futuro.

La aplicación educativa **no** administra esa configuración: solo la **consume**,
la cachea y la **aplica**.

---

## 2. Principio: separar Política de Consumo

| Responsabilidad | Dónde vive | Quién lo controla |
|---|---|---|
| **Política** (límites, zona horaria, canales, flags) | Microservicio | Superadmin |
| **Consumo real** (SMS enviados, etc.) | App educativa (`NotificationLog`) | Envíos de la app |
| **Enforcement** (bloquear si se excede) | App educativa | Al enviar |

> El microservicio define "1000 SMS/mes"; la app es quien sabe cuántos van y
> decide bloquear. El consumo puede quedarse local o **reportarse** de vuelta al
> microservicio (ver §8).

---

## 3. Modelo de datos propuesto (Microservicio)

Entidad de configuración por empresa/tenant (nombre a definir, p. ej.
`CompanyConfig` / `TenantConfig`):

```jsonc
{
  "company": "acme",                 // o el identificador que use el microservicio
  "tenantId": "0000000",             // clave por tenant
  "isActive": true,

  "notifications": {
    "sms": {
      "enabled": true,
      "monthlyLimit": 1000           // 0 = ilimitado
    },
    "whatsapp": {
      "enabled": false,
      "monthlyLimit": 0
    }
  },

  "timezone": "America/Bogota",      // IANA (recomendado) u offset "-05:00"
  "locale": "es-CO",

  // extensible a futuro
  "limits": {
    "maxStudents": 0,
    "maxTeachers": 0,
    "maxStorageMb": 0
  },

  "createdAt": "2026-09-23T00:00:00.000Z",
  "updatedAt": "2026-09-23T00:00:00.000Z"
}
```

Notas:
- **Clave**: definir si es por `tenantId`, por `company`, o por
  `company + tenantId`. Se recomienda `tenantId` como clave primaria lógica.
- **Zona horaria**: se recomienda **IANA** (`America/Bogota`) por robustez ante
  horario de verano. Alternativa simple: offset UTC (ej. `-05:00`).
- **Límite 0** = ilimitado (o usar `null`).

---

## 4. Contrato de integración (Microservicio → App educativa)

### Opción A — Comando TCP dedicado (recomendado)
La app consulta bajo demanda y cachea:

```
cmd: 'getTenantConfig'
payload: { serviceKey, tenantId }
response: { company, tenantId, notifications, timezone, locale, limits }
```

### Opción B — Incluir la config en login/perfil
Más simple (un solo viaje), pero obliga a re-consultar al cambiar la config.

```
login / getProfile -> { user, company, tenantConfig: { ... } }
```

### Opción C — Evento de cambio (opcional, complementa A o B)
El microservicio notifica cambios para invalidar caché:

```
evento: 'tenantConfig.updated'
payload: { tenantId }
```

> Recomendado: **A + C** (consulta bajo demanda con caché e invalidación por
> evento). Si no hay eventos, usar **TTL** de caché (5–15 min).

---

## 5. Consumo en la App educativa

1. **Cliente TCP**: usar el `USER_SERVICE` ya existente
   (`src/core/tcp` / `AuthService`).
2. **Caché en memoria** con TTL por `tenantId` para no golpear al microservicio
   en cada envío.
3. **Valores por defecto** si no hay config o el microservicio no responde:
   - `timezone`: `America/Bogota`
   - `sms.enabled`: `true`
   - `sms.monthlyLimit`: `0` (ilimitado) o un valor local configurable.
4. **Aplicación**:
   - **Notificaciones**: `date.util.ts` obtiene la zona del tenant (en lugar del
     offset fijo actual) para formatear fechas/horas.
   - **Cuota SMS**: antes de enviar, comparar `usado + lote` vs
     `notifications.sms.monthlyLimit`; si excede, no enviar y registrar el
     rechazo con `code: 'quota'`.
   - **Frontend**: `TimezoneService` lee la zona del tenant y formatea las
     fechas/horas de la UI.

---

## 6. Cálculo del consumo (App educativa)

El consumo se deriva de `NotificationLog`:

```
channel: 'sms'
status: 'enviado'
tenantId: <tenant>
fechaCreacion: { $gte: primerDíaMes, $lte: últimoDíaMes }
```

Consideraciones:
- **Corte mensual**: calcularlo en la **zona horaria del tenant** (no UTC).
- **Concurrencia**: hoy el envío es secuencial por lotes (`maxConcurrent = 5`).
  Para cuotas estrictas, considerar una **reserva atómica** de contador
  (colección de contadores por tenant/mes) o un margen de seguridad.
- Definir si se cuentan solo **aceptados** (`status:'enviado'`) o también
  intentos fallidos. Recomendado: solo aceptados.

---

## 7. Resiliencia

- Si el microservicio está caído o no hay config: usar **caché** y luego
  **defaults**.
- Definir política ante ausencia de config:
  - **Fail-open** (recomendado por defecto): seguir enviando sin límite.
  - **Fail-closed**: bloquear envíos hasta tener config.
- Registrar en logs cuándo se usa config cacheada o por defecto.

---

## 8. Reporte de uso (opcional)

Para reportes centralizados en el microservicio, la app puede **reportar** el
consumo:

```
cmd: 'reportTenantUsage'
payload: { serviceKey, tenantId, period: '2026-09', channel: 'sms', used: 123 }
```

Alternativas:
- Reporte por lote/periódico (recomendado).
- Reporte en tiempo real (más costoso).
- No reportar (consumo solo local) si no se necesitan reportes centralizados.

---

## 9. Flujo end-to-end

1. Superadmin (en el microservicio) configura la empresa: límite SMS, zona
   horaria, canales.
2. App educativa consulta `getTenantConfig` (o lo recibe en el perfil) y lo
   cachea.
3. Al generar una notificación, la app:
   - Verifica `sms.enabled` y la cuota del mes.
   - Si hay cupo, envía; si no, bloquea y registra `code: 'quota'`.
   - Formatea fechas/horas con la zona horaria del tenant.
4. (Opcional) La app reporta el consumo al microservicio.

---

## 10. Decisiones pendientes

1. **Clave de configuración**: ¿por `tenantId`, `company` o `company+tenantId`?
2. **Zona horaria**: ¿IANA (`America/Bogota`) u offset (`-05:00`)?
3. **Entrega de config**: ¿comando TCP dedicado, incluida en login/perfil, o
   ambos?
4. **Invalidación**: ¿evento de cambio o solo TTL de caché?
5. **Cuota**: ¿solo SMS o también WhatsApp/correo? ¿bloqueo duro o advertencia?
6. **Corte mensual**: ¿zona del tenant o UTC?
7. **Consumo**: ¿solo local o reportado al microservicio?
8. **Ante fallo**: ¿fail-open o fail-closed?
9. **Alcance de la zona horaria**: ¿solo notificaciones o toda la UI?
10. **¿Existe ya** un modelo/endpoint de configuración de empresa en el
    microservicio o hay que crearlo?

---

## 11. Fases sugeridas

1. **Microservicio**: modelo de configuración de empresa + UI de superadmin +
   comando TCP `getTenantConfig`.
2. **App educativa**: cliente + caché + defaults + `TimezoneService`.
3. **Enforcement**: cuota SMS + zona horaria en notificaciones.
4. **Opcional**: reporte de uso + evento de invalidación de caché.

---

## 12. Referencias en la App educativa

- Superadmin existente: `UserLocal.isSuperAdmin`, JWT
  (`auth.controller.ts`), frontend (`process-auth-data.ts`).
- Patrón de config por empresa: `MailConfig`, `CardSettings`,
  `DataTreatmentConfig`.
- Registro de envíos: `NotificationLog` (`channel`, `status`, `tenantId`,
  `fechaCreacion`).
- Formateo de fechas de notificaciones: `notifications/helpers/date.util.ts`.
- Cliente TCP: `src/core/tcp` + `USER_SERVICE`.
