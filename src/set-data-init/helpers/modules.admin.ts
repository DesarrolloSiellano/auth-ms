export const ADMIN_MODULE = [
  {
    name: 'adminUserModule',
    description: 'Module for admin user functionalities',
    isActive: true,
    isSystemModule: true,
    created: new Date(),
    modified: new Date(),
    createdBy: 'System',
    routes: [
      {
        name: 'Pages',
        path: '/pages',
        initPath: '/pages/users',
        icon: 'dashboard',
        children: [
          {
            name: 'Users',
            path: '/users',
            icon: 'users',
          },
          {
            name: 'Roles',
            path: '/roles',
            icon: 'unlock',
          },
          {
            name: 'Permissions',
            path: '/permissions',
            icon: 'key',
          },
          {
            name: 'Modules',
            path: '/modules',
            icon: 'directions',
          },
        ],
      },
    ],
  },
];
