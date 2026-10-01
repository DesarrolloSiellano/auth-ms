import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Rol } from './entities/role.entity';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(
    @InjectModel('Rol') private readonly rolModel: Model<Rol>,
    private readonly tenantConfigService: TenantConfigService,
  ) {}

  async create(createRoleDto: CreateRoleDto) {
    const newRole = new this.rolModel(createRoleDto);
    const result = await newRole.save();

    if (!result) {
      throw new NotFoundException('Role not created');
    }

    // Registra la política de tope del rol (`limits.roles.<CODE>`).
    await this.ensureRoleLimitPolicy(result.codeRol, result.name);

    return {
      message: 'Role created successfully',
      data: result,
      meta: {
        totalData: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        id: result._id,
      },
    };
  }

  async findAll() {
    const roles = await this.rolModel.find().lean().exec();
    if (!roles || roles.length === 0) {
      throw new NotFoundException('No roles found');
    }
    return roles;
  }

  async findOne(id: string) {
    const role = await this.rolModel.findById(id).lean().exec();
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return role;
  }

  async findByPage(from?: number, limit?: number, global?: any) {
    const query: any = {};
    if (global) {
      query.$or = [
        { name: new RegExp(global, 'i') },
        { action: new RegExp(global, 'i') },
        { resource: new RegExp(global, 'i') },
        { description: new RegExp(global, 'i') },
      ];
    }

    const skipNumber = from && from >= 0 ? from : 0;
    const limitNumber = limit && limit > 0 ? limit : 100;

    const [docs, totalData] = await Promise.all([
      this.rolModel
        .find(query)
        .select(
          'name codeRol description isActive dateCreated hourCreated permissions',
        )
        .skip(skipNumber)
        .limit(limitNumber)
        .lean()
        .exec(),
      this.rolModel.countDocuments(query).exec(),
    ]);

    return {
      message: 'Roles found',
      data: docs,
      meta: {
        totalData: totalData,
      },
    };
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    const updatedRole = await this.rolModel
      .findByIdAndUpdate(id, updateRoleDto, { new: true })
      .exec();

    if (!updatedRole) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    return {
      message: 'Role updated successfully',
      data: updatedRole,
      meta: {
        totalData: 1,
        updatedAt: new Date().toISOString(),
        id: updatedRole._id,
      },
    };
  }

  async remove(id: string) {
    const deletedRole = await this.rolModel.findByIdAndDelete(id).exec();
    if (!deletedRole) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return deletedRole;
  }

  /** Alta idempotente de la política de tope `limits.roles.<CODE>` del rol. */
  private async ensureRoleLimitPolicy(
    codeRol?: string,
    label?: string,
  ): Promise<void> {
    if (!codeRol) return;
    try {
      await this.tenantConfigService.ensureRoleLimitPolicy(codeRol, label);
    } catch (error: any) {
      this.logger.warn(
        `No se pudo registrar limits.roles.${codeRol}: ${error?.message}`,
      );
    }
  }
}
