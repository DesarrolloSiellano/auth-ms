import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { PolicyDefinitionSchema } from './entities/policy-definition.entity';
import { TenantConfigSchema } from './entities/tenant-config.entity';
import { TenantConfigController } from './tenant-config.controller';
import { TenantConfigService } from './tenant-config.service';
import { FeaturePolicyService } from 'src/core/services/feature-policy.service';
import { LocaleService } from 'src/core/services/locale.service';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'PolicyDefinition', schema: PolicyDefinitionSchema },
      { name: 'TenantConfig', schema: TenantConfigSchema },
    ]),
  ],
  controllers: [TenantConfigController],
  providers: [TenantConfigService, FeaturePolicyService, LocaleService],
  exports: [TenantConfigService, FeaturePolicyService, LocaleService],
})
export class TenantConfigModule {}
