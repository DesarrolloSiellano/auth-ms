import { Module } from '@nestjs/common';

import { SetDataInit } from './set-data-init.service';


@Module({
  providers: [SetDataInit],
})
export class SetDataInitModule {}
