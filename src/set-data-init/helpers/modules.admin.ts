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
        isActive: null,
        children: [
          {
            name: 'Users',
            path: '/users',
            icon: 'users',
            isActive: true,
            _id: '68e86f941bc240101209cd89',
          },
          {
            name: 'Roles',
            path: '/roles',
            icon: 'unlock',
            isActive: true,
            _id: '68e86f941bc240101209cd8a',
          },
          {
            name: 'Permissions',
            path: '/permissions',
            icon: 'key',
            isActive: true,
            _id: '68e86f941bc240101209cd8b',
          },
          {
            name: 'Modules',
            path: '/modules',
            icon: 'directions',
            isActive: true,
            _id: '68e86f941bc240101209cd8c',
          },
          {
            name: 'Companies',
            path: '/companies',
            icon: 'building',
            isActive: true,
            _id: '68e86f941bc240101209cd8d',
          },
        ],
      },
    ],
  },
];
