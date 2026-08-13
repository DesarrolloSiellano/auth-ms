export interface JwtPayload {
  _id: any;
  name: string;
  lastName: string;
  email: string;
  username: string;
  isActived: boolean;
  company: string;
  tenantId: string;
  isSuperAdmin?: boolean;
}
