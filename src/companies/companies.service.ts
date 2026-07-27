import { Injectable, NotFoundException } from '@nestjs/common';
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
    const company = new this.companyModel(createCompanyDto);
    const result = await company.save();

    if (!result) {
      throw new NotFoundException('Company not created');
    }

    return {
      message: 'Company created successfully',
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
    const companies = await this.companyModel.find().lean().exec();
    if (!companies || companies.length === 0) {
      throw new NotFoundException('No companies found');
    }
    return companies;
  }

  async findByPage(from?: number, limit?: number, global?: any) {
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
      .lean()
      .exec();
    const totalData = await this.companyModel.countDocuments(query);

    return {
      message: 'Companies found',
      data: docs,
      meta: {
        totalData,
      },
    };
  }

  async findByAutoComplete(word?: string) {
    if (!word) {
      return {
        message: 'No search word provided',
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
      .lean()
      .exec();

    return {
      message: 'Companies found by autocomplete',
      data: result,
      meta: {
        totalData: result.length,
      },
    };
  }

  async findOne(id: string) {
    const company = await this.companyModel.findById(id).lean().exec();
    if (!company) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto) {
    const updatedCompany = await this.companyModel
      .findByIdAndUpdate(id, updateCompanyDto, { new: true })
      .exec();

    if (!updatedCompany) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }

    return {
      message: 'Company updated successfully',
      data: updatedCompany,
      meta: {
        totalData: 1,
        updatedAt: new Date().toISOString(),
        id: updatedCompany._id,
      },
    };
  }

  async remove(id: string) {
    const deletedCompany = await this.companyModel.findByIdAndDelete(id).exec();
    if (!deletedCompany) {
      throw new NotFoundException(`Company with ID ${id} not found`);
    }
    return deletedCompany;
  }
}
