import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { MailService } from 'src/mail/mail.service';
import * as generatePassword from 'generate-password';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly mailService: MailService,
  ) {}

  async create(createUserDto: CreateUserDto) {
    // Generar contraseña temporal segura
    const tempPassword = generatePassword.generate({
      length: 12,
      numbers: true,
      uppercase: true,
      symbols: true,
      strict: true,
    });

    const userData = {
      ...createUserDto,
      _id: createUserDto._id, // Si viene de otra app, lo usamos; si no, será undefined y Mongo lo generará
      password: tempPassword,
    };

    const newUser = new this.userModel(userData);
    const result = await newUser.save();

    this.mailService
      .sendEmail({
        to: result.email,
        subject: 'Bienvenido a BpoNet - Activa tu cuenta',
        template: 'welcome',
        context: {
          name: result.name,
          platform_name: 'BpoNet',
          username: result.email,
          password: tempPassword,
          login_url: userData.redirectUri
            ? userData.redirectUri
            : 'https://app.bponet.com.co',
        },
      })
      .catch((error: any) => {
        console.log('Error sending email:', error);
      });

    return {
      data: result,
      message: 'User created successfully. Activation email sent.',
      meta: {
        totalData: 1,
        createdAt: new Date().toISOString(),
        id: result._id,
      },
    };
  }

  async findAll(user?: any) {
    const query: any = {};
    if (user && !user.isSuperAdmin) {
      query.company = user.company;
    }

    const users = await this.userModel.find(query).lean().exec();
    if (!users || users.length === 0) {
      throw new NotFoundException('No users found');
    }
    return users;
  }

  async findByPage(user?: any, from?: number, limit?: number, global?: any) {
    const { isSuperAdmin } = user;
    const query: any = {};

    if (!isSuperAdmin) {
      query.company = user.company;
    }

    if (global) {
      const regex = new RegExp(global, 'i');
      if (isSuperAdmin) {
        query.$or = [
          { name: regex },
          { lastName: regex },
          { username: regex },
          { email: regex },
          { phone: regex },
          { company: regex },
        ];
      } else {
        query.$or = [
          { name: regex },
          { lastName: regex },
          { username: regex },
          { email: regex },
          { phone: regex },
        ];
      }
    }
    const skipNumber = from && from >= 0 ? from : 0;
    const limitNumber = limit && limit > 0 ? limit : 100;

    const [docs, totalData] = await Promise.all([
      this.userModel
        .find(query)
        .skip(skipNumber)
        .limit(limitNumber)
        .lean()
        .exec(),
      this.userModel.countDocuments(query).exec(),
    ]);

    return {
      data: docs,
      meta: {
        totalData: totalData,
      },
    };
  }

  // Paginación simple: ?page=1&limit=10 (puedes mejorarla con DTO o query params en el controller)
  async findByPagination(user?: any, page = 1, limit = 10) {
    const query: any = {};
    if (user && !user.isSuperAdmin) {
      query.company = user.company;
    }

    const skip = (page - 1) * limit;
    const [users, totalData] = await Promise.all([
      this.userModel.find(query).skip(skip).limit(limit).lean().exec(),
      this.userModel.countDocuments(query).exec(),
    ]);

    console.log(user);

    return {
      data: users,
      meta: {
        totalData,
        page,
        limit,
      },
    };
  }

  // Búsqueda simple por ID
  async findOne(id: string) {
    const user = await this.userModel.findById(id).lean().exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  // Si quieres filtrar por fecha de creación, ajusta el DTO y lógica aquí
  async findByDate(user?: any, startDate?: string, endDate?: string) {
    // Validación simple de fechas
    if (!startDate || !endDate) {
      throw new NotFoundException(
        'You must provide both startDate and endDate',
      );
    }

    // Convierte las fechas a objetos Date
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Ajusta si quieres incluir el final completo del día (opcional)
    end.setHours(23, 59, 59, 999);

    // Busca por rango de fechas en createdAt
    const query: any = {
      createdAt: {
        $gte: start,
        $lte: end,
      },
    };

    if (user && !user.isSuperAdmin) {
      query.company = user.company;
    }

    const users = await this.userModel.find(query).lean().exec();

    if (!users || users.length === 0) {
      throw new NotFoundException('No users found for given date range');
    }

    return {
      message: 'Users retrieved by date range successfully',
      data: users,
      meta: {
        totalData: users.length,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { ...updateData } = updateUserDto;
    console.log('prueba');

    console.log('DTO', updateUserDto);

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();

    console.log('Updated User', updatedUser);

    if (!updatedUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return updatedUser;
  }

  async remove(id: string) {
    const deletedUser = await this.userModel.findByIdAndDelete(id).exec();
    if (!deletedUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return deletedUser;
  }
}
