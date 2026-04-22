import * as tencentcloud from 'tencentcloud-sdk-nodejs-sms';
import type { SmsClient, SmsPurpose } from './interface';
import { AppError, ErrCode } from '@/lib/domain/errors';

const SmsClientSDK = tencentcloud.sms.v20210111.Client;

export class TencentSmsClient implements SmsClient {
  private client: InstanceType<typeof SmsClientSDK>;

  constructor() {
    const id = process.env.TENCENT_SMS_SECRET_ID;
    const key = process.env.TENCENT_SMS_SECRET_KEY;
    if (!id || !key) {
      throw new AppError(
        ErrCode.SmsSendFailed,
        'TENCENT_SMS_SECRET_ID/SECRET_KEY 未配置；请改用 MOCK_SMS=true 或填入凭证'
      );
    }
    this.client = new SmsClientSDK({
      credential: { secretId: id, secretKey: key },
      region: process.env.TENCENT_SMS_REGION ?? 'ap-guangzhou',
      profile: { httpProfile: { endpoint: 'sms.tencentcloudapi.com' } },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendCode(phone: string, code: string, _purpose: SmsPurpose): Promise<void> {
    const appId = process.env.TENCENT_SMS_APP_ID;
    const sign = process.env.TENCENT_SMS_SIGN_NAME;
    const tmpl = process.env.TENCENT_SMS_TEMPLATE_ID;
    if (!appId || !sign || !tmpl) {
      throw new AppError(ErrCode.SmsSendFailed, 'TENCENT_SMS_APP_ID/SIGN/TEMPLATE 未配置');
    }
    const phoneNumber = phone.startsWith('+') ? phone : `+86${phone}`;
    const resp = await this.client.SendSms({
      PhoneNumberSet: [phoneNumber],
      SmsSdkAppId: appId,
      SignName: sign,
      TemplateId: tmpl,
      TemplateParamSet: [code, '5'], // {1}=code {2}=有效分钟
    });
    const status = resp.SendStatusSet?.[0];
    if (status?.Code !== 'Ok') {
      throw new AppError(
        ErrCode.SmsSendFailed,
        `腾讯云 SMS 失败: ${status?.Code} ${status?.Message}`
      );
    }
  }
}
