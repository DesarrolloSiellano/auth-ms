import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Idempotency } from './schemas/idempotency.schema';

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectModel(Idempotency.name)
    private readonly idempotencyModel: Model<Idempotency>,
  ) {}

  async findKey(key: string, method: string, path: string): Promise<Idempotency | null> {
    // MongoDB maneja la expiración automáticamente mediante el índice TTL
    return this.idempotencyModel.findOne({ key, method, path }).exec();
  }

  async saveKey(key: string, method: string, path: string, response: any): Promise<void> {
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24); // Guardamos por 24 horas

      const entry = new this.idempotencyModel({
        key,
        method,
        path,
        response,
        expiresAt,
      });

      await entry.save();
    } catch (error: any) {
      // Si es un error de duplicado (E11000), simplemente lo ignoramos
      // ya que significa que otra petición paralela ya guardó el resultado.
      if (error.code === 11000) {
        return;
      }
      throw error;
    }
  }
}
