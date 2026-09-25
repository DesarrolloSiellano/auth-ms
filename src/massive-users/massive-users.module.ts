import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UserSchema } from 'src/users/entities/user.entity';
import { RolSchema } from 'src/roles/entities/role.entity';
import { PermissionSchema } from 'src/permissions/entities/permission.entity';
import { ModuleSchema } from 'src/modules/entities/module.entity';
import { CompanySchema } from 'src/companies/entities/company.entity';
import { MailService } from 'src/mail/mail.service';

import { MassiveUsersController } from './massive-users.controller';
import { MassiveUsersService } from './massive-users.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'User', schema: UserSchema },
      { name: 'Rol', schema: RolSchema },
      { name: 'Permission', schema: PermissionSchema },
      { name: 'Module', schema: ModuleSchema },
      { name: 'Company', schema: CompanySchema },
    ]),
  ],
  controllers: [MassiveUsersController],
  providers: [MassiveUsersService, MailService],
})
export class MassiveUsersModule {}
