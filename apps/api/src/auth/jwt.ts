import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';
import { appError } from '../lib/errors';

export const ACCESS_TTL_SECONDS = 15 * 60;
export const APP_AUDIENCE = 'dialed-app';

export interface AccessClaims {
  sub: string;
  sid: string;
  scope: 'app';
}

export class JwtService {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  constructor(
    pem: string,
    private readonly kid: string,
    private readonly issuer: string,
  ) {
    this.privateKey = createPrivateKey(pem);
    if (this.privateKey.asymmetricKeyType !== 'ed25519') throw new Error('JWT key must be Ed25519');
    this.publicKey = createPublicKey(this.privateKey);
  }

  sign(claims: AccessClaims, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
    return new SignJWT({ sid: claims.sid, scope: claims.scope })
      .setProtectedHeader({ alg: 'EdDSA', kid: this.kid, typ: 'at+jwt' })
      .setSubject(claims.sub)
      .setIssuer(this.issuer)
      .setAudience(APP_AUDIENCE)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + ACCESS_TTL_SECONDS)
      .sign(this.privateKey);
  }

  /** Verifies an app access token. Expired → `token_expired`; anything else → `unauthorized`. */
  async verify(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        algorithms: ['EdDSA'],
        issuer: this.issuer,
        audience: APP_AUDIENCE,
      });
      if (
        payload.scope !== 'app' ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string'
      ) {
        throw appError('unauthorized');
      }
      return { sub: payload.sub, sid: payload.sid, scope: 'app' };
    } catch (e) {
      if (e instanceof errors.JWTExpired) throw appError('token_expired');
      throw appError('unauthorized');
    }
  }
}
