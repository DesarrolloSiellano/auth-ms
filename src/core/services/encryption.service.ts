import * as bcrypt from 'bcrypt';
import { Injectable } from '@nestjs/common';

@Injectable()
export class EncryptionService {
  private readonly saltRounds = 10;

  /**
   * Encripta una contraseña en texto plano
   * @param plainPassword La contraseña en texto plano
   * @returns Contraseña encriptada (hash)
   */
  async hashPassword(plainPassword: string): Promise<string> {
    const salt = await bcrypt.genSalt(this.saltRounds);  
    return bcrypt.hash(plainPassword, salt);
  }

  /**
   * Verifica si una contraseña ingresada coincide con la almacenada
   * @param plainPassword Contraseña ingresada por el usuario
   * @param hashedPassword Contraseña encriptada almacenada
   * @returns true si coinciden, false si no
   */
  async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
}
