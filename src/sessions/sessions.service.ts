import { Injectable } from '@nestjs/common';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

@Injectable()
export class SessionsService {
  create(createSessionDto: CreateSessionDto) {
    return {
      message: 'This action adds a new session',
      data: createSessionDto,
    };
  }

  findAll() {
    return [];
  }

  findOne(id: number) {
    return { id };
  }

  update(id: number, updateSessionDto: UpdateSessionDto) {
    return { id, ...updateSessionDto };
  }

  remove(id: number) {
    return { id, deleted: true };
  }
}
