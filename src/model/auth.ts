import { DAY, SECOND } from './time.js';
import { TokenData } from './types.js';

export class Auth {

  readonly token: string;
  readonly refresh: string;
  readonly expiry: number;

  constructor(data: TokenData) {
    this.token = data.access_token;
    this.refresh = data.refresh_token;
    this.expiry = Date.now() + (data.expires_in * SECOND) - DAY;
  }
}