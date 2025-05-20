import axios, { AxiosResponse } from 'axios';
import { Logger } from 'homebridge';
import langEn from './lang/en.js';
import { jwtDecode } from 'jwt-decode';
import { HTTP_RETRY_CODES, SECOND } from './constants.js';

type TokenData = {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
};

type TokenResponse = {
  data: TokenData[];
};

type JwtPayload = {
  user_id: string;
  type: string;
  scope: string[];
  iat: number;
  exp: number;
  iss: string;
  sub: string;
};

export type WaterUsage = {
  today: [{value: number}];
  month: [{value: number}];
  prevMonth: [{value: number}];
}

export type WaterUsageResponse = {
  data: WaterUsage;
}

export type LeakInfo = {
  active: boolean;
}

export type Device = {
  id: string;
  bridge_id: string;
  product: string;
  battery_level: string;
  connected: boolean;
};

type DeviceResponse = {
  data: Device[];
};

type LeakInfoResponse = {
  data: LeakInfo;
}

export class FlumeAPI {
  private accessToken?: string;
  private refreshToken?: string;
  private expiresIn?: number;
  private userId?: string;

  constructor(
    private readonly log: Logger,
    private readonly username: string,
    private readonly password: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly isBeta: boolean,
  ) {
  }

  async obtainToken(): Promise<boolean> {
    try {

      // Generate the JSON data to send
      const body = {
        grant_type: 'password',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        username: this.username,
        password: this.password,
      };
      
      const now = Date.now();

      // Perform the HTTP request
      const res: AxiosResponse<TokenResponse> = await axios.post('https://api.flumetech.com/oauth/token', body, {
        timeout: 10 * SECOND,
      });

      // Check to see we got a response
      if (!res.data) {
        throw new Error(langEn.noDataReceived);
      }

      /*
        {
          success: true,
          code: 602,
          message: 'Request OK',
          http_code: 200,
          http_message: 'OK',
          detailed: null,
          data: [
            {
              token_type: 'bearer',
              access_token: '',
              expires_in: 604800,
              refresh_token: ''
            }
          ],
          count: 1,
          pagination: null
        }
      */

      // Check to see we got a proper response
      if (!res.data.data || !res.data.data[0]) {
        this.log.warn('[HTTP obtainToken()] %s.', JSON.stringify(res.data));
        throw new Error(langEn.noDataReceived);
      }

      // Make the token available in other functions
      this.accessToken = res.data.data[0].access_token;
      this.refreshToken = res.data.data[0].refresh_token;
      this.expiresIn = now + res.data.data[0].expires_in;

      // Log the response if in debug mode
      this.logIfBeta(
        '[HTTP obtainToken()] %s.',
        JSON.stringify(res.data).replaceAll(this.accessToken, '[redacted]').replaceAll(this.refreshToken, '[redacted]'),
      );

      // Obtain the user ID
      this.userId = (jwtDecode(this.accessToken) as JwtPayload).user_id;

      /*
        {
          user_id: 0000,
          type: 'USER',
          scope: [ 'read:personal', 'update:personal', 'query:personal' ],
          iat: 0000000000,
          exp: 0000000000,
          iss: 'flume_oauth',
          sub: ''
        }
      */
      return true;
    } catch (err: unknown) {
      const error = err as { code?: string; message: string };
      if (error.code && HTTP_RETRY_CODES.includes(error.code)) {
        // Retry if another attempt could be successful
        this.log.warn('[HTTP obtainToken()] %s [%s].', langEn.httpRetry, error.code);
        await this.sleep(30 * SECOND);
        return this.obtainToken();
      }
      throw new Error(`[HTTP obtainToken()] ${error.message}`);
    }
  }

  async renewToken(): Promise<boolean> {
    try {
      // Check we have a refresh token
      if (!this.refreshToken) {
        throw new Error(langEn.noRefreshToken);
      }

      // Generate the JSON data to send
      const body = {
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
      };
      const now = Date.now();

      // Perform the HTTP request
      const res: AxiosResponse<TokenResponse> = await axios.post('https://api.flumetech.com/oauth/token', body, {
        timeout: 10 * SECOND,
      });

      // Check to see we got a response
      if (!res.data) {
        throw new Error(langEn.noDataReceived);
      }

      // Make the token available in other functions
      this.accessToken = res.data.data[0].access_token;
      this.refreshToken = res.data.data[0].refresh_token;
      this.expiresIn = now + res.data.data[0].expires_in;

      // Log the response if in debug mode
      // Redact the access token and refresh token
      this.logIfBeta(
        '[HTTP renewToken()] %s.',
        JSON.stringify(res.data).replaceAll(this.accessToken, '[redacted]').replaceAll(this.refreshToken, '[redacted]'),
      );

      /*
          {
            success: true,
            code: 602,
            message: 'Request OK',
            http_code: 200,
            http_message: 'OK',
            detailed: null,
            data: [
              {
                token_type: 'bearer',
                access_token: '',
                expires_in: 604800,
                refresh_token: ''
              }
            ],
            count: 1,
            pagination: null
          }
        */
      return true;
    } catch (err: unknown) {
      const error = err as { code?: string; message: string };
      if (error.code && HTTP_RETRY_CODES.includes(error.code)) {
        // Retry if another attempt could be successful
        this.log.warn('[HTTP renewToken()] %s [%s].', langEn.httpRetry, error.code);
        await this.sleep(30 * SECOND);
        return this.renewToken();
      }
      throw new Error(`[HTTP renewToken()] ${error.message}`);
    }
  }

  async getDevices(): Promise<Device[]> {
    try {
      // Check we have a user id
      if (!this.userId || !this.accessToken) {
        throw new Error(langEn.noUserId);
      }

      // Perform the HTTP request
      const res: AxiosResponse<DeviceResponse> = await axios.get(
        `https://api.flumetech.com/users/${this.userId}/devices?list_shared=true`,
        {
          headers: { Authorization: `Bearer ${this.accessToken}` },
          timeout: 10 * SECOND,
        },
      );

      // Check to see we got a response
      if (!res.data) {
        throw new Error(langEn.noDataReceived);
      }

      // Log the response if in debug mode
      this.logIfBeta('[HTTP getDevices()] %s.', JSON.stringify(res.data));

      return res.data.data;
    } catch (err: unknown) {
      const error = err as { code?: string; message: string };
      if (error.code && HTTP_RETRY_CODES.includes(error.code)) {
        // Retry if another attempt could be successful
        this.log.warn('[HTTP getDevices()] %s [%s].', langEn.httpRetry, error.code);
        await this.sleep(30 * SECOND);
        return this.getDevices();
      }
      throw new Error(`[HTTP getDevices()] ${error.message}`);
    }
  }

  async getDeviceInfo(deviceId: string): Promise<Device> {
    // Refresh the access token if it has expired already
    if (Date.now() > (this.expiresIn ?? 0)) {
      await this.renewToken();
    }
    const res: AxiosResponse<DeviceResponse> = await axios.get(
      `https://api.flumetech.com/users/${this.userId}/devices/${deviceId}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      },
    );
    if (!res.data) {
      throw new Error(langEn.noDataReceived);
    }
    this.logIfBeta('[HTTP getDeviceInfo()] %s.', JSON.stringify(res.data));
    return res.data.data[0];
  }

  async getWaterUsage(deviceId: string): Promise<WaterUsage> {
    // Refresh the access token if it has expired already
    if (Date.now() > (this.expiresIn ?? 0)) {
      await this.renewToken();
    }

    // Generate dates for the query data
    const date = new Date();
    const startOfToday = `${date.toISOString().substring(0, 10)} 00:00:00`;

    // Set the date to the first of the current month
    date.setDate(1);
    const startOfCurrMonth = `${date.toISOString().substring(0, 10)} 00:00:00`;

    // Set the month to the previous month
    date.setMonth(date.getMonth() - 1);
    const startOfPrevMonth = `${date.toISOString().substring(0, 10)} 00:00:00`;

    // Generate the JSON data to send
    const body = {
      queries: [
        {
          request_id: 'today',
          bucket: 'DAY',
          since_datetime: startOfToday,
          operation: 'SUM',
          units: 'GALLONS',
        },
        {
          request_id: 'month',
          bucket: 'MON',
          since_datetime: startOfCurrMonth,
          operation: 'SUM',
          units: 'GALLONS',
        },
        {
          request_id: 'prevMonth',
          bucket: 'MON',
          since_datetime: startOfPrevMonth,
          until_datetime: startOfCurrMonth,
          operation: 'SUM',
          units: 'GALLONS',
        },
      ],
    };

    // Send the request
    const res: AxiosResponse<WaterUsageResponse> = await axios.post(
      `https://api.flumetech.com/users/${this.userId}/devices/${deviceId}/query`,
      body,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      },
    );

    // Check to see we got a response
    if (!res.data) {
      throw new Error(langEn.noDataReceived);
    }

    // Log the response if in debug mode
    this.logIfBeta('[HTTP getWaterUsage()] %s.', JSON.stringify(res.data));

    // Parse the response
    return res.data.data;
  }

  async getLeakInfo(deviceId: string): Promise<LeakInfo> {
    // Refresh the access token if it has expired already
    if (Date.now() > (this.expiresIn ?? 0)) {
      await this.renewToken();
    }
    const res: AxiosResponse<LeakInfoResponse> = await axios.get(
      `https://api.flumetech.com/users/${this.userId}/devices/${deviceId}/leaks/active`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      },
    );
    if (!res.data) {
      throw new Error(langEn.noDataReceived);
    }
    this.logIfBeta('[HTTP getLeakInfo()] %s.', JSON.stringify(res.data));
    return res.data.data;
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private logIfBeta(message: string, ...parameters: any[]) {
    if (!this.isBeta) {
      return;
    }
    this.log.info(message, parameters);
  }
}
