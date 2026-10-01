# Roadmap: Plataforma de Autenticación — Brechas vs. Industria y Estándar

Objetivo: registrar pendientes para evolucionar `authentication/auth-ms` según
estándares (NIST 800-63B, OWASP ASVS, OAuth2/OIDC, SCIM, Ley 1581/GDPR).

## Ya implementado
- JWT access + refresh, sesiones con `isActive` y revocación inmediata (`sid`) validada en HTTP y TCP (`validateUser`/`validateSession`).
- Login por email/usuario; cambio de contraseña; recuperación; set-password-token.
- Multi-tenant (company/tenantId) con tenant plugin; roles/permisos/módulos.
- Service-to-service (`serviceKey`, TCP con TLS/mTLS), idempotencia, throttling.
- Carga masiva de usuarios; políticas/config por tenant (`tenant_config`).
- Dashboard de uso; gestión de sesiones (listar/revocar individual y masiva).
- Swagger/OpenAPI; logs (pino).

## Prioridad ALTA (seguridad y cumplimiento)
1. MFA/2FA (NIST AAL2): TOTP, passkeys/WebAuthn, OTP email/SMS. Requerir MFA a SuperAdmin; configurable por tenant.
2. OIDC/OAuth2 como proveedor (SSO real entre apps): authorization code + PKCE, discovery, JWKS, id_token, userinfo, registro de clientes, logout global (`end_session`).
3. Claves asimétricas (RS256/ES256) + JWKS + rotación; rotación de refresh token + detección de reuso.
4. Políticas de contraseña (longitud, complejidad, historial/no reuso, expiración) + chequeo de filtraciones (HIBP).
5. Recuperación con token de un solo uso y expiración (integrar `set-password-token`; hoy envía contraseña temporal).
6. Verificación de correo (existe `verify.hbs` sin flujo) y de teléfono.
7. Anti fuerza bruta / credential stuffing: bloqueo progresivo, retardo, captcha, bloqueo temporal.
8. Auditoría inmutable (login OK/fallo, cambios de rol/permisos, revocaciones) con retención.
9. Security headers (Helmet: HSTS, CSP) + rate limit por usuario/endpoint.
10. Health checks (`@nestjs/terminus`, `/health` liveness/readiness).

## Prioridad MEDIA (madurez IAM)
11. Autorización fina (scopes/recursos) + motor de políticas (OPA/CASL).
12. SCIM 2.0 + webhooks/eventos (`user.created/updated/deleted`, `session.revoked`).
13. Acceso condicional por tenant (allowlist IP, requerir MFA, TTL sesión, horarios) sobre `tenant_config`.
14. Dispositivos/sesiones confiables, límite de sesiones concurrentes, notificación de nuevo inicio de sesión.
15. Step-up authentication para acciones privilegiadas.
16. Self-service: cambio de email/teléfono con verificación, perfil/avatar.
17. Passwordless/magic link y federación (Google/Microsoft/Entra).
18. i18n y branding por tenant en plantillas de correo.

## Prioridad BAJA (operación y compliance)
19. Observabilidad (Prometheus/OpenTelemetry) y alertas de seguridad.
20. Cifrado de PII a nivel de campo y enmascaramiento en logs/respuestas.
21. Gestión de secretos/KMS + rotación; backups/DR documentados.
22. Cumplimiento: consentimiento, retención, derecho al olvido, portabilidad (Ley 1581/GDPR).
23. Pruebas de seguridad (SAST/DAST, e2e OIDC/SCIM) y pentest.
24. CAPTCHA/honeypot en registro/recovery; detección de anomalías.
25. Versionado de API y política de deprecación; docs de integración.

## Sinergias con lo actual
- `tenant_config/policies` = base para acceso condicional (MFA, TTL, IP, límites).
- `sessions` ya permite enforcement (revocación validada en HTTP/TCP; admin acotado a su empresa, sin revocar SuperAdmins); falta TTL idle/absoluto configurable y notificaciones.
- `serviceKey/TCP` ya cubre M2M; el siguiente salto es OIDC para SSO de usuarios.

## Fases sugeridas
1. Quick wins: Helmet + health checks + políticas de contraseña + recovery con token + lockout + auditoría.
2. MFA (TOTP + email OTP) y step-up.
3. OIDC/OAuth2 proveedor (PKCE, JWKS, discovery) + logout global.
4. Claves asimétricas + rotación de refresh + reuse detection.
5. SCIM/webhooks + acceso condicional por tenant.
