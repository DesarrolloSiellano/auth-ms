import { SetMetadata } from '@nestjs/common';

export const PARAM_FORMAT_KEY = 'param_format';

export type ParamKind = 'objectId' | 'token';

export interface ParamFormatRule {
  param: string;
  kind: ParamKind;
}

/**
 * Declara el formato esperado de parámetros de ruta. `objectId` exige un
 * ObjectId válido; `token` exige un patrón seguro (letras, dígitos, . _ -).
 */
export const ParamFormat = (...rules: ParamFormatRule[]) =>
  SetMetadata(PARAM_FORMAT_KEY, rules);
