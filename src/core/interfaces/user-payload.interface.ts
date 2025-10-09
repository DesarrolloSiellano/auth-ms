export interface UserPayload {
  _id: string
  name: string
  lastName: string
  email: string
  phone: string
  username: string
  password: string
  roles: Role[]
  permissions: Permission[]
  modules: Module[]
  company: string
  created: string
  modified: string
  isActived: boolean
  isAdmin: boolean
  isNewUser: boolean
  __v: number
}

export interface Role {
  _id: string
  name: string
  codeRol: string
  description: string
  isActive: boolean
  isInheritPermissions: boolean
  permissions: Permission[]
}

export interface Permission {
  _id: string
  name: string
  description: string
  action: string
  isActive: boolean
}

export interface Module {
  _id: string
  name: string
  description: string
  isActive: boolean
  isSystemModule: boolean
}
