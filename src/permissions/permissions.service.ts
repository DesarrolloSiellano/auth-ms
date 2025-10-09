import {
  BadRequestException,
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
    try {
      const permission = new this.permissionModel(createPermissionDto);
      const result = await permission.save();

      if (!result) {
        throw new NotFoundException('Permission not created');
      }

      return {
        message: 'Permission created successfully',
        statusCode: 201,
        status: 'Success',
        data: result,
        meta: {
          totalData: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          id: result._id,
        },
      };
    } catch (error) {
      if (error.code === 11000) {
        throw new BadRequestException(
          'Duplicate key error: Permission already exists ' +
            JSON.stringify(error.keyValue),
        );
      }
      throw new BadRequestException('Error creating leader: ' + error.message);
    }
  }

  async findAll() {


    const permissions = await this.permissionModel.find().exec();
    if (!permissions) {
      throw new NotFoundException('No permissions found');
    }
    return {
      message: 'Find all permissions',
      statusCode: 200,
      status: 'Success',
      data: permissions,
      meta: {
        totalData: permissions.length,
      },
    };
  }

  async findByPage(from?: number, limit?: number, global?: any, filters?: any) {

    const query: any = {};
    // Búsqueda global en varios campos
    if (global) {
      query.$or = [
        { name: new RegExp(global, 'i') },
        { action: new RegExp(global, 'i') },
        //{ isActive: Boolean(global) },
        { resource: new RegExp(global, 'i') },
        { description: new RegExp(global, 'i') },
      ];
    }
    const skipNumber = from && from >= 0 ? from : 0;
    const limitNumber = limit && limit > 0 ? limit : 100;
    const docs = await this.permissionModel
      .find(query)
      .skip(skipNumber)
      .limit(limitNumber);
    const totalData = await this.permissionModel.countDocuments(query);
    
    return {
      statusCode: 200,
      status: 'Success',
      message: 'Permissions found',
      data: docs,
      meta: {
        totalData: totalData,
      },
    };
  }

  async findOne(id: string) {
    const permission = await this.permissionModel.findById(id).exec();
    if (!permission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }
    return {
      message: 'Find one permission',
      statusCode: 200,
      status: 'Success',
      data: permission,
      meta: {
        totalData: 1,
      },
    };
  }

  async update(id: string, updatePermissionDto: UpdatePermissionDto) {
    try {
      const updatedPermission = await this.permissionModel
        .findByIdAndUpdate(id, updatePermissionDto, { new: true })
        .exec();
      if (!updatedPermission) {
        throw new NotFoundException(`Permission with ID ${id} not found`);
      }
      return {
        message: 'Permission updated successfully',
        statusCode: 200,
        status: 'Success',
        data: updatedPermission,
        meta: {
          totalData: 1,
          updatedAt: new Date().toISOString(),
          id: updatedPermission._id,
        },
      };
    } catch (error) {
      if (error.code === 11000) {
        throw new BadRequestException(
          'Duplicate key error: Leader already exists ' +
            JSON.stringify(error.keyValue),
        );
      }
      throw new BadRequestException('Error creating leader: ' + error.message);
    }
  }

  async remove(id: string) {
    const deletedPermission = await this.permissionModel
      .findByIdAndDelete(id)
      .exec();
    if (!deletedPermission) {
      throw new NotFoundException(`Permission with ID ${id} not found`);
    }
    return {
      message: 'Permission deleted successfully',
      statusCode: 200,
      status: 'Success',
      data: deletedPermission,
      meta: {
        totalData: 1,
        deletedAt: new Date().toISOString(),
        id: deletedPermission._id,
      },
    };
  }
}
