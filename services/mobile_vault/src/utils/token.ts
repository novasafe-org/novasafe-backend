import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export interface UserPayload {
  id: string;
  email: string;
  name?: string;
  picture?: string;
  jti?: string;
}

export const generateToken = (user: UserPayload): { token: string; tokenId: string } => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is not configured');
  const tokenId = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, picture: user.picture },
    process.env.JWT_SECRET,
    { expiresIn: '7d', issuer: 'vault-backend', audience: 'vault-frontend', jwtid: tokenId }
  );
  return { token, tokenId };
};

export const verifyToken = (token: string): UserPayload & { jti?: string } => {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is not configured');
  return jwt.verify(token, process.env.JWT_SECRET, {
    issuer: 'vault-backend',
    audience: 'vault-frontend',
  }) as UserPayload & { jti?: string };
};
