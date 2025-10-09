

export interface JwtPayload {
    _id: any 
    name: string;
    lastName: string;
    email: string;
    username: string;
    date_joined: Date;
    isActived: boolean;
    isAdmin: boolean;
    company: string;
    modules: any[];
    roles: any[];
    permissions: any[];
  }