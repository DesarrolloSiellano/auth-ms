export const ROLES = [
  {
    name: 'Administrador',
    codeRol: 'ADM',
    description: 'Acceso completo al sistema con privilegios de superusuario',
    created: new Date(),
    modiefied: new Date(),
    isActive: true,
    isInheritPermissions: false,
    
  },
  {
    name: 'Usuario Básico',
    codeRol: 'USR',
    description: 'Acceso limitado a funciones principales del sistema',
    created: new Date(),
    modiefied: new Date(),
    isActive: true,
    isInheritPermissions: true,
  
  },
  {
    name: 'Auditor',
    codeRol: 'AUD',
    description: 'Rol de solo lectura para revisión de registros',
    created: new Date(),
    modiefied: new Date(),
    isActive: true,
    isInheritPermissions: false,

  },
];

