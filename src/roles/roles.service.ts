import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Rol } from './entities/role.entity';
import { Types } from 'mongoose';

@Injectable()
export class RolesService {

  constructor(@InjectModel('Rol') private readonly rolModel: Model<Rol>) {}

  async create(createRoleDto: CreateRoleDto) {
  try {
    const newRole = new this.rolModel(createRoleDto);
    const result = await newRole.save();

    if (!result) {
      throw new NotFoundException('Role not created');
    }

    return {
      message: 'Role created successfully',
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
      // Código de error MongoDB para clave duplicada
      throw new BadRequestException('Duplicate key error: Role already exists');
    }
    // Para cualquier otro error, se lanza de nuevo para que se gestione globalmente
    throw error;
  }
}

  async findAll() {
    const roles = await this.rolModel.find().exec();
    if (!roles) {
      throw new NotFoundException('No roles found');
    }
    return {
      message: 'Roles retrieved successfully',
      statusCode: 200,
      status: 'Success',
      data: roles,
      meta: {
        totalData: roles.length,
      },
    };
  }

  async findOne(id: string) {
    const role = await this.rolModel.findById(id).exec();
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return {
      message: 'Role retrieved successfully',
      statusCode: 200,
      status: 'Success',
      data: role,
      meta: {
        totalData: 1,
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
    const docs = await this.rolModel
      .find(query)
      .skip(skipNumber)
      .limit(limitNumber);
    const totalData = await this.rolModel.countDocuments(query);
    return {
      statusCode: 200,
      status: 'Success',
      message: 'Roles found',
      data: docs,
      meta: {
        totalData: totalData,
      },
    };
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
  try {
    const updatedRole = await this.rolModel
      .findByIdAndUpdate(id, updateRoleDto, { new: true })
      .exec();

    if (!updatedRole) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }

    return {
      message: 'Role updated successfully',
      statusCode: 200,
      status: 'Success',
      data: updatedRole,
      meta: {
        totalData: 1,
        updatedAt: new Date().toISOString(),
        id: updatedRole._id,
      },
    };
  } catch (error) {
    if (error.code === 11000) {
      throw new BadRequestException('Duplicate key error: Role with given data already exists');
    }
    throw error;
  }
}

  async remove(id: string) {
    const deletedRole = await this.rolModel.findByIdAndDelete(id).exec();
    if (!deletedRole) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return {
      message: 'Role deleted successfully',
      statusCode: 200,
      status: 'Success',
      data: deletedRole,
      meta: {
        totalData: 1,
        deletedAt: new Date().toISOString(),
        id: deletedRole._id,
      }
    };
  }

}
