import jwt, { type Secret, type SignOptions } from 'jsonwebtoken';
import { config } from '../config.js';

export function signToken(payload: { sub: string; role: string }) {
  return jwt.sign(payload, config.jwtSecret as Secret, {
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn']
  });
}
