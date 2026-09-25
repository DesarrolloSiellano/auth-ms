import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PolicyDefinitionSchema } from './entities/policy-definition.entity';
import { TenantConfigSchema } from './entities/tenant-config.entity';
import {
  TenantUsageSchema,
  TenantUsageReportSchema,
} from './entities/tenant-usage.entity';
import { TenantConfigController } from './tenant-config.controller';
import { TenantConfigService } from './tenant-config.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'PolicyDefinition', schema: PolicyDefinitionSchema },
      { name: 'TenantConfig', schema: TenantConfigSchema },
      { name: 'TenantUsage', schema: TenantUsageSchema },
      { name: 'TenantUsageReport', schema: TenantUsageReportSchema },
    ]),
  ],
  controllers: [TenantConfigController],
  providers: [TenantConfigService],
  exports: [TenantConfigService],
})
export class TenantConfigModule {}
