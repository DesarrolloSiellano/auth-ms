import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Module } from './entities/module.entity';

@Injectable()
export class ModulesService {
  constructor(
    @InjectModel('Module') private readonly moduleModel: Model<Module>,
  ) {
    // Initialization logic if needed
  }
  async create(createModuleDto: CreateModuleDto) {
    const module = new this.moduleModel(createModuleDto);
    const result = await module.save();

    if (!result) {
      throw new NotFoundException('Module not created');
    }

    return {
      message: 'Module created successfully',
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
    const modules = await this.moduleModel.find().lean().exec();
    if (!modules) {
      throw new NotFoundException('No modules found');
    }

    return modules;
  }

  async findOne(id: string) {
    const module = await this.moduleModel.findById(id).lean().exec();
    if (!module) {
      throw new NotFoundException(`Module with ID ${id} not found`);
    }
    return module;
  }

  async findByPage(from?: number, limit?: number, global?: any) {
    const query: any = {};
    if (global) {
      query.$or = [
        { name: new RegExp(global, 'i') },
        { description: new RegExp(global, 'i') },
      ];
    }
    const skipNumber = from && from >= 0 ? from : 0;
    const limitNumber = limit && limit > 0 ? limit : 100;
    const docs = await this.moduleModel
      .find(query)
      .skip(skipNumber)
      .limit(limitNumber)
      .lean()
      .exec();
    const totalData = await this.moduleModel.countDocuments(query);

    return {
      message: 'Modules found',
      data: docs,
      meta: {
        totalData: totalData,
      },
    };
  }

  async update(id: string, updateModuleDto: UpdateModuleDto) {
    const updatedModule = await this.moduleModel
      .findByIdAndUpdate(id, updateModuleDto, { new: true })
      .exec();
    if (!updatedModule) {
      throw new NotFoundException(`Module with ID ${id} not found`);
    }

    return {
      message: 'Module updated successfully',
      data: updatedModule,
      meta: {
        totalData: 1,
        updatedAt: new Date().toISOString(),
        id: updatedModule._id,
      },
    };
  }

  async remove(id: string) {
    const deletedModule = await this.moduleModel.findByIdAndDelete(id).exec();
    if (!deletedModule) {
      throw new NotFoundException(`Module with ID ${id} not found`);
    }

    return deletedModule;
  }
}
