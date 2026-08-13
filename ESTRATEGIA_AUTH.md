# Estrategia de Arquitectura: Refactorización del Flujo de Autenticación (SSO)

Este documento detalla el problema actual de infraestructura relacionado con el tamaño excesivo de los tokens JWT y establece la estrategia definitiva para solucionarlo tanto en el backend (`auth-ms`) como en el frontend (`crm-educative`) u cualquiewr otro.

---

## 1. El Problema: "431 Request Header Fields Too Large"

Actualmente, el sistema sufre de caídas (Error HTTP 431) al intentar iniciar sesión en el entorno de desarrollo y potencialmente en producción.

### ¿Por qué ocurre esto?

El Microservicio de Autenticación (`auth-ms`) está generando un JWT (JSON Web Token) que actúa como un **"Token Todo-en-Uno"**. Dentro de su carga útil (Payload), el backend está incrustando no solo la identidad del usuario, sino **el árbol completo de permisos, módulos, sub-módulos, rutas e íconos**.

Un token típico en esta arquitectura está estructurado de la siguiente manera:

```json
{
  "_id": "6a15...",
  "name": "Maicol",
  "email": "maicol_tascon@...",
  "modules": [
    {
      "name": "adminUserModule",
      "routes": [ { "name": "Pages", "children": [...] } ]
    },
    { "name": "helpDesk", "routes": [] },
    { "name": "crmCampaign", "routes": [...] },
    { "name": "whatsapp-api-bpo", "routes": [...] },
    { "name": "crmEducative", "routes": [...] }
  ],
  "iat": 1786552950,
  "exp": 1786556550
}
```

Al redireccionar desde el SSO (`auth.bponet.com.co`) hacia el frontend (`crm-educative`) u otro sistema, este JWT gigantesco se envía a través de la URL como un parámetro (`?access_token=eyJ...`).

Debido a su colosal tamaño (frecuentemente superior a los 16 KB):

- **Node.js y Vite (Frontend Local):** Rechazan la conexión instantáneamente porque superan el límite de seguridad `max-http-header-size` configurado por defecto para mitigar vulnerabilidades (CVE-2018-12121).
- **Nginx / AWS / Proxies (Producción):** Tienen límites muy estrictos para el tamaño de las cabeceras HTTP y las URLs. Enviar tokens tan pesados garantiza errores `414 URI Too Long` o `431` en infraestructura de red estándar.

---

## 2. La Solución Arquitectónica (Separación de Identidad y Autorización)

La buena práctica universal en arquitecturas de microservicios dicta que **el JWT es un documento de identidad, no una base de datos**.

Para resolver esto definitivamente, la estrategia se divide en dos fases coordinadas:

### Fase A: Cambios en el Backend (`auth-ms`)

1. **Adelgazar el Payload del JWT:**
   Modificar el servicio encargado de emitir el token al momento del login. Se deben eliminar por completo los arreglos `modules`, `permissions` y `roles` del interior del JWT.

   **Nuevo Payload Esperado (Ligero, < 1 KB):**

   ```json
   {
     "_id": "6a15aa34beff67e3e3463c52",
     "name": "Maicol",
     "lastName": "Tascon",
     "email": "maicol_tascon@hotmail.com",
     "tenantId": "000000",
     "roleCode": "ADM",
     "iat": 1786552950,
     "exp": 1786556550
   }
   ```

2. **Exponer un nuevo Endpoint de Autorización (Profile/Modules):**
   Crear un nuevo endpoint protegido (Ejemplo: `GET /api/users/profile` o `GET /api/auth/modules`).
   - Este endpoint recibirá el JWT ligero en su cabecera `Authorization: Bearer <token>`.
   - Validará al usuario, extraerá su `_id`, e irá a la base de datos a recolectar el enorme JSON de módulos, rutas e íconos.
   - Devolverá este árbol masivo como el **Cuerpo de la Respuesta (Body HTTP)**, el cual no sufre de las restricciones de tamaño de las URLs o Cabeceras.

### Fase B: Cambios en el Frontend (`crm-educative`) u otro frontend

1. **Captura del Token Ligero (Guard):**
   El `AuthGuard` continuará interceptando el parámetro de la URL (`?access_token=...`). Como ahora es diminuto, la redirección del SSO será rápida y nunca fallará.
   El Guard limpiará la URL con `Location.replaceState` y guardará el token base en `localStorage`.

2. **Consumo de Configuración Post-Login:**
   En el momento en que se procese exitosamente el inicio de sesión, en lugar de intentar extraer los módulos decodificando el JWT (ya no existirán ahí), el frontend realizará una petición HTTP al nuevo endpoint expuesto en la Fase A:

   ```typescript
   // Ejemplo conceptual del nuevo flujo post-redirección
   this.http.get("/api/users/profile").subscribe((profileData) => {
     // profileData contiene los 'modules', 'roles' y 'permissions'
     this.processAuthData.saveModulesToLocalStorage(profileData.modules);
     this.router.navigate(["/pages/dashboard"]);
   });
   ```

3. **Manejo de Refresco:**
   El flujo de `refreshToken` interceptado por `auth.interceptor.ts` se mantiene igual. Al obtener nuevos tokens, la identidad se renueva y, de ser necesario, se dispara nuevamente la consulta del perfil para actualizar permisos si hubo un cambio de roles en vivo.

---

## 3. Beneficios Obtenidos

- **Resolución permanente de límites (Error 431 / 414):** Desaparece la necesidad de alterar configuraciones nativas de Node.js, `nginx.conf`, Apache o AWS para acomodar cabeceras anómalas.
- **Mayor Seguridad Estructural:** Extraer los permisos masivos del JWT previene que información interna de las rutas quede tan expuesta permanentemente en el token.
- **Rendimiento de Red:** Las llamadas a APIs recurrentes (con `Authorization: Bearer <token>`) serán exponencialmente más rápidas. Actualmente, en _cada_ petición al backend, el frontend viaja subiendo un token de ~20KB. Al reducirlo a unos cientos de bytes, el ancho de banda utilizado por peticiones se desploma.
- **Desacoplamiento:** Si a un usuario se le otorgan nuevos permisos o módulos en pleno uso del sistema, basta con consultar de nuevo el endpoint `/api/auth/modules` sin necesidad de obligarlo a reloguearse para expedirle un nuevo token.
