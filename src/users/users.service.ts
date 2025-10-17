import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class UsersService {
  url = 'https//app.bponet.com.co';
  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly mailService: MailService,
  ) {}

  async create(createUserDto: CreateUserDto, ms: boolean = false) {
    try {
      const newUser = new this.userModel(createUserDto);
      const result = await newUser.save();
      if (ms && !result) {
        return {
          message: 'User not created',
          statusCode: 500,
          status: 'Error',
          data: null,
          meta: null,
        };
      }
      if (!result) {
        throw new NotFoundException('User not created');
      }

      this.mailService.sendEmail({
        to: result.email,
        subject: 'Bienvenido a BpoNet',
        template: 'welcome', // nombre del archivo welcome.hbs
        context: {
          name: result.name,
          platform_name: 'BpoNet',
          username: result.email,
          password: createUserDto.password, // si tienes la contraseña original aquí (revisar seguridad)
          login_url: this.url, // url de login real de tu app
        },
      });

      return {
        message: 'User created successfully',
        statusCode: 201,
        status: 'Success',
        data: result,
        meta: {
          totalData: 1,
          createdAt: new Date().toISOString(),
          id: result._id,
        },
      };
    } catch (error) {
      if (ms) {
        if (error.code === 11000) {
          return {
            message:
              'Duplicate key error: User already exists ' +
              JSON.stringify(error.keyValue),
            statusCode: 400,
            status: 'Error',
            data: null,
            meta: null,
          };
        }
        return {
          message: 'Error creating user: ' + error.message,
          statusCode: 500,
          status: 'Error',
          data: null,
          meta: null,
        };
      }
      if (error.code === 11000) {
        throw new BadRequestException(
          'Duplicate key error: User already exists ' +
            JSON.stringify(error.keyValue),
        );
      }
      throw new BadRequestException('Error creating user: ' + error.message);
    }
  }

  async findAll() {
    const users = await this.userModel.find().exec();
    if (!users || users.length === 0) {
      throw new NotFoundException('No users found');
    }
    return {
      message: 'Users retrieved successfully',
      statusCode: 200,
      status: 'Success',
      data: users,
      meta: {
        totalData: users.length,
      },
    };
  }

  async findByPage(
    user?: any,
    from?: number,
    limit?: number,
    global?: any,
    filters?: any,
  ) {
    const { isSuperAdmin } = user;

    const query: any = {};

    if (!isSuperAdmin) {
      query.company = user.company;
    }
    // Búsqueda global en varios campos
    if (global) {
      const regex = new RegExp(global, 'i');
      // Si es superadmin, busca global en todos los campos incluyendo compañía
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
        // No superadmin: búsqueda global menos en compañía (porque ya filtra con company fija)
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
    const docs = await this.userModel
      .find(query)
      .skip(skipNumber)
      .limit(limitNumber);
    const totalData = await this.userModel.countDocuments(query);

    return {
      statusCode: 200,
      status: 'Success',
      message: 'Modules found',
      data: docs,
      meta: {
        totalData: totalData,
      },
    };
  }

  // Paginación simple: ?page=1&limit=10 (puedes mejorarla con DTO o query params en el controller)
  async findByPagination(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [users, totalData] = await Promise.all([
      this.userModel.find().skip(skip).limit(limit).exec(),
      this.userModel.countDocuments(),
    ]);

    return {
      message: 'Paginated users retrieved successfully',
      statusCode: 200,
      status: 'Success',
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
    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return {
      message: 'User retrieved successfully',
      statusCode: 200,
      status: 'Success',
      data: user,
      meta: {
        totalData: 1,
      },
    };
  }

  // Si quieres filtrar por fecha de creación, ajusta el DTO y lógica aquí
  async findByDate(startDate: string, endDate: string) {
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
    const users = await this.userModel
      .find({
        createdAt: {
          $gte: start,
          $lte: end,
        },
      })
      .exec();

    if (!users || users.length === 0) {
      throw new NotFoundException('No users found for given date range');
    }

    return {
      message: 'Users retrieved by date range successfully',
      statusCode: 200,
      status: 'Success',
      data: users,
      meta: {
        totalData: users.length,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    try {
      const { password, company, ...updateData } = updateUserDto;

      const updatedUser = await this.userModel
        .findByIdAndUpdate(id, updateData, { new: true })
        .exec();

      if (!updatedUser) {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      return {
        message: 'User updated successfully',
        statusCode: 200,
        status: 'Success',
        data: updatedUser,
        meta: {
          totalData: 1,
          updatedAt: new Date().toISOString(),
          id: updatedUser._id,
        },
      };
    } catch (error) {
      if (error.code === 11000) {
        throw new BadRequestException(
          'Duplicate key error: User already exists ' +
            JSON.stringify(error.keyValue),
        );
      }
      throw new BadRequestException('Error creating user: ' + error.message);
    }
  }

  async remove(id: string) {
    const deletedUser = await this.userModel.findByIdAndDelete(id).exec();
    if (!deletedUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return {
      message: 'User deleted successfully',
      statusCode: 200,
      status: 'Success',
      data: deletedUser,
      meta: {
        totalData: 1,
        deletedAt: new Date().toISOString(),
        id: deletedUser._id,
      },
    };
  }
}
