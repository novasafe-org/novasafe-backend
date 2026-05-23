import { OAuth2Client } from 'google-auth-library';
import { authConfig } from '../../../config/auth.config';

export interface GoogleTokenPayload {
  email: string;
  sub: string;
  emailVerified: boolean;
  name?: string;
  givenName?: string;
  picture?: string;
}

export class GoogleAuthProvider {
  private readonly client = new OAuth2Client();

  async verifyIdToken(idToken: string): Promise<GoogleTokenPayload> {
    const audiences = authConfig.google.audiences;
    if (!audiences.length) {
      throw new Error('Google OAuth audience is not configured on server');
    }
    const ticket = await this.client.verifyIdToken({ idToken, audience: audiences });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) {
      throw new Error('Google token missing required claims');
    }
    if (!payload.email_verified) {
      throw new Error('Google account email is not verified');
    }
    return {
      email: payload.email.toLowerCase().trim(),
      sub: payload.sub,
      emailVerified: Boolean(payload.email_verified),
      name: payload.name,
      givenName: payload.given_name,
      picture: payload.picture,
    };
  }
}

let googleProvider: GoogleAuthProvider | null = null;
export const getGoogleAuthProvider = (): GoogleAuthProvider => {
  if (!googleProvider) googleProvider = new GoogleAuthProvider();
  return googleProvider;
};
