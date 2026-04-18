export type SmsPurpose = 'login' | 'register';

export interface SmsClient {
  sendCode(phone: string, code: string, purpose: SmsPurpose): Promise<void>;
}
