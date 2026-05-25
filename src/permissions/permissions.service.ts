import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Permission } from './entities/permission.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectModel('Permission')
    private readonly permissionModel: Model<Permission>,
  ) {}

  async create(createPermissionDto: CreatePermissionDto) {
    const permission = new this.permissionModel(createPermissionDto);
    const result = await permission.save();

    if (!result) {
      throw new NotFoundException('Permission not created');
    }

    return {
      message: 'Permission created successfully',
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
    const permissions = await this.permissionModel.find().lean().exec();
    if (!permissions || permissions.length === 0) {
      throw new NotFoundException('No permissions found');
    }
    return permissions;
  }

  async findByPage(from?: number, limit?: number, global?: any, filters?: any) {
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
      this.permissionModel
        .find(query)
        .select('name description action resource type isActive')
        .skip(skipNumber)
        .limit(limitNumber)
        .lean()
        .exec(),
      this.permissionModel.countDocuments(query).exec(),
    ]);
    
    return {
      message: 'Permissions found',
      data: docs,
      meta: {
        totalData: totalData,
      },
    };
  }

  async findOne(id: string) {
    const permission = await this.permissionModel.findById(id).lean().exec();
    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }
    return permission;
  }

  async update(id: string, updatePermissionDto: UpdatePermissionDto) {
    const updatedPermission = await this.permissionModel
      .findByIdAndUpdate(id, updatePermissionDto, { new: true })
      .exec();
    if (!updatedPermission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }
    return {
      message: 'Permission updated successfully',
      data: updatedPermission,
      meta: {
        totalData: 1,
        updatedAt: new Date().toISOString(),
        id: updatedPermission._id,
      },
    };
  }

  async remove(id: string) {
    const deletedPermission = await this.permissionModel
      .findByIdAndDelete(id)
      .exec();
    if (!deletedPermission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }
    return deletedPermission;
  }
}
