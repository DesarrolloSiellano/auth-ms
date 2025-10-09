import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity'; // Asegúrate de tener esta entidad definida correctamente

@Injectable()
export class CompaniesService {
  constructor(
    @InjectModel('Company')
    private readonly companyModel: Model<Company>,
  ) {}

  async create(createCompanyDto: CreateCompanyDto) {
    try {
      const company = new this.companyModel(createCompanyDto);
      const result = await company.save();

      if (!result) {
        throw new NotFoundException('Company not created');
      }

      return {
        message: 'Company created successfully',
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
          'Duplicate key error: Company already exists ' +
            JSON.stringify(error.keyValue),
        );
      }
      throw new BadRequestException('Error creating company: ' + error.message);
    }
  }

  async findAll() {
    const companies = await this.companyModel.find().exec();
    if (!companies || companies.length === 0) {
      throw new NotFoundException('No companies found');
    }
    return {
      message: 'Find all companies',
      statusCode: 200,
      status: 'Success',
      data: companies,
      meta: {
        totalData: companies.length,
      },
    };
  }

  async findByPage(from?: number, limit?: number, global?: any, filters?: any) {
    const query: any = {};

    if (global) {
      const regex = new RegExp(global, 'i');
      query.$or = [
        { name: regex },
        { legalRepresentative: regex },
        { ruc: regex },
        { address: regex },
        { phone: regex },
        { email: regex },
        { web: regex },
      ];
    }

    const skipNumber = from && from >= 0 ? from : 0;
    const limitNumber = limit && limit > 0 ? limit : 100;

    const docs = await this.companyModel
      .find(query)
      .skip(skipNumber)
      .limit(limitNumber)
      .exec();
    const totalData = await this.companyModel.countDocuments(query);

    return {
      statusCode: 200,
      status: 'Success',
      message: 'Companies found',
      data: docs,
      meta: {
        totalData,
      },
    };
  }

  async findByAutoComplete(word?: string) {
    try {
      if (!word) {
        return {
          message: 'No search word provided',
          statusCode: 200,
          status: 'Success',
          data: [],
          meta: {
            totalData: 0,
          },
        };
      }

      const regex = new RegExp(word, 'i'); // Búsqueda insensible a mayúsculas/minúsculas
      const result = await this.companyModel
      .find({
        isActive: true,
        $or: [
          { name: regex },
          { legalRepresentative: regex },
          { id: regex },
          { address: regex },
          { phone: regex },
          { email: regex },
          { web: regex },
        ],
      })
      .limit(10) // Limitar cantidad para autocompletado
      .sort({ _id: -1 }) // Similar al ejemplo orden descendente
      .exec();

      

      return {
        message: 'Companies found by autocomplete',
        statusCode: 200,
        status: 'Success',
        data: result,
        meta: {
          totalData: result.length,
        },
      };
    } catch (error) {
      throw new BadRequestException(
        'Error in autocomplete search: ' + error.message,
      );
    }
  }

  async findOne(id: string) {
    const company = await this.companyModel.findById(id).exec();
    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return {
      message: 'Find one company',
      statusCode: 200,
      status: 'Success',
      data: company,
      meta: {
        totalData: 1,
      },
    };
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto) {
    try {
      const updatedCompany = await this.companyModel
        .findByIdAndUpdate(id, updateCompanyDto, { new: true })
        .exec();

      if (!updatedCompany) {
        throw new NotFoundException(`Company with ID ${id} not found`);
      }

      return {
        message: 'Company updated successfully',
        statusCode: 200,
        status: 'Success',
        data: updatedCompany,
        meta: {
          totalData: 1,
          updatedAt: new Date().toISOString(),
          id: updatedCompany._id,
        },
      };
    } catch (error) {
      if (error.code === 11000) {
        throw new BadRequestException(
          'Duplicate key error: Company already exists ' +
            JSON.stringify(error.keyValue),
        );
      }
      throw new BadRequestException('Error updating company: ' + error.message);
    }
  }

  async remove(id: string) {
    const deletedCompany = await this.companyModel.findByIdAndDelete(id).exec();
    if (!deletedCompany) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return {
      message: 'Company deleted successfully',
      statusCode: 200,
      status: 'Success',
      data: deletedCompany,
      meta: {
        totalData: 1,
        deletedAt: new Date().toISOString(),
        id: deletedCompany._id,
      },
    };
  }
}
