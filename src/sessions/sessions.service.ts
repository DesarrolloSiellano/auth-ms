import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session } from './entities/session.entity';

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel('Session') private readonly sessionModel: Model<Session>,
  ) {}

  async createSession(data: Partial<Session>): Promise<Session> {
    const session = new this.sessionModel(data);
    return session.save();
  }

  async findActiveByRefreshHash(hash: string): Promise<Session | null> {
    return this.sessionModel
      .findOne({ refreshToken: hash, isActive: true })
      .lean()
      .exec();
  }

  async deactivateByRefreshHash(hash: string): Promise<void> {
    await this.sessionModel
      .updateOne({ refreshToken: hash, isActive: true }, { isActive: false })
      .exec();
  }
}
