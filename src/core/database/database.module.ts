import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { ConfigService } from '@nestjs/config';
import { RolSchema } from 'src/roles/entities/role.entity';
import { PermissionSchema } from 'src/permissions/entities/permission.entity';
import { UserSchema } from 'src/users/entities/user.entity';
import { ModuleSchema } from 'src/modules/entities/module.entity';
import { CompanySchema } from 'src/companies/entities/company.entity';
import { SessionSchema } from 'src/sessions/entities/session.entity';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
          useFactory: (configService: ConfigService) => ({
            uri: configService.get<string>('MONGO_URI'), // Lee la URI desde las variables de entorno
          }),
          inject: [ConfigService],
        }),
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'Rol', schema: RolSchema },
      { name: 'Permission', schema: PermissionSchema },
      { name: 'Module', schema: ModuleSchema },
      { name: 'Company', schema: CompanySchema },
      { name: 'Session', schema: SessionSchema }
    ]),
  ],
  exports: [MongooseModule]
})
export class DatabaseModule {}