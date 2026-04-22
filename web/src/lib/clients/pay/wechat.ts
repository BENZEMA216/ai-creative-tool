import { readFileSync, existsSync } from 'node:fs';
import { AppError, ErrCode } from '@/lib/domain/errors';
import type { PayClient, CreateOrderInput, CreateOrderResult, VerifiedCallback } from './interface';

interface WechatConfig {
  appid: string;
  mchid: string;
  apiV3Key: string;
  serialNo: string;
  certPath: string;
  keyPath: string;
}

function readConfig(): WechatConfig {
  const appid = process.env.WECHAT_PAY_APP_ID;
  const mchid = process.env.WECHAT_PAY_MCH_ID;
  const apiV3Key = process.env.WECHAT_PAY_API_V3_KEY;
  const serialNo = process.env.WECHAT_PAY_SERIAL_NO;
  const certPath =
    process.env.WECHAT_PAY_CERT_PATH ?? '/opt/ai-creative-tool/certs/apiclient_cert.pem';
  const keyPath =
    process.env.WECHAT_PAY_KEY_PATH ?? '/opt/ai-creative-tool/certs/apiclient_key.pem';

  const missing: string[] = [];
  if (!appid) missing.push('WECHAT_PAY_APP_ID');
  if (!mchid) missing.push('WECHAT_PAY_MCH_ID');
  if (!apiV3Key) missing.push('WECHAT_PAY_API_V3_KEY');
  if (!serialNo) missing.push('WECHAT_PAY_SERIAL_NO');
  if (missing.length > 0) {
    throw new AppError(
      ErrCode.WechatPayCreateFailed,
      `微信支付配置缺失: ${missing.join(', ')}；或设 MOCK_PAY=true`
    );
  }
  if (!existsSync(certPath)) {
    throw new AppError(ErrCode.WechatPayCreateFailed, `证书文件不存在: ${certPath}`);
  }
  if (!existsSync(keyPath)) {
    throw new AppError(ErrCode.WechatPayCreateFailed, `私钥文件不存在: ${keyPath}`);
  }

  return {
    appid: appid!,
    mchid: mchid!,
    apiV3Key: apiV3Key!,
    serialNo: serialNo!,
    certPath,
    keyPath,
  };
}

type WxPayInstance = {
  transactions_native(params: {
    description: string;
    out_trade_no: string;
    notify_url: string;
    amount: { total: number; currency: string };
  }): Promise<{ status: number; data?: { code_url?: string; prepay_id?: string }; error?: unknown }>;
  verifySign(params: {
    timestamp: string | number;
    nonce: string;
    body: string | Record<string, unknown>;
    serial: string;
    signature: string;
    apiSecret?: string;
  }): Promise<boolean>;
  decipher_gcm<T>(ciphertext: string, associated_data: string, nonce: string, key?: string): T;
};

/**
 * 微信支付 V3 Native 客户端真实现。
 *
 * 使用 `wechatpay-node-v3` SDK (v2.x) 处理：
 * - V3 RSA 签名（请求头 Authorization）
 * - 平台证书拉取 + 回调验签（异步）
 * - AES-GCM 回调 resource 解密
 *
 * 配置：
 * - 必需 env: WECHAT_PAY_APP_ID / MCH_ID / API_V3_KEY / SERIAL_NO
 * - 证书路径（可选 env，有默认）: WECHAT_PAY_CERT_PATH / KEY_PATH
 */
export class WechatPayClient implements PayClient {
  private pay: WxPayInstance;
  private cfg: WechatConfig;

  constructor() {
    this.cfg = readConfig();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WxPay = require('wechatpay-node-v3').default;
    this.pay = new WxPay({
      appid: this.cfg.appid,
      mchid: this.cfg.mchid,
      serial_no: this.cfg.serialNo,
      publicKey: readFileSync(this.cfg.certPath),
      privateKey: readFileSync(this.cfg.keyPath),
      key: this.cfg.apiV3Key,
    }) as WxPayInstance;
  }

  async createNativeOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const amountInFen = Math.round(input.amountYuan * 100);
    try {
      const result = await this.pay.transactions_native({
        description: input.description,
        out_trade_no: input.orderNo,
        notify_url: input.notifyUrl,
        amount: { total: amountInFen, currency: 'CNY' },
      });

      const codeUrl = result.data?.code_url;
      if (!codeUrl) {
        throw new AppError(
          ErrCode.WechatPayCreateFailed,
          `微信返回无 code_url: status=${result.status} error=${JSON.stringify(result.error ?? result).slice(0, 200)}`
        );
      }
      return {
        qrCodeUrl: codeUrl,
        // Native pay 没有 prepay_id，用 orderNo 占位保持接口兼容
        prepayId: result.data?.prepay_id ?? input.orderNo,
      };
    } catch (e) {
      if (e instanceof AppError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      throw new AppError(ErrCode.WechatPayCreateFailed, `微信支付下单失败: ${msg}`);
    }
  }

  async verifyCallback(headers: Record<string, string | undefined>, body: unknown): Promise<VerifiedCallback> {
    const eventType = (body as { event_type?: string })?.event_type;
    const resource = (body as { resource?: { ciphertext: string; nonce: string; associated_data: string } })?.resource;

    if (!resource) {
      throw new AppError(ErrCode.WechatPayCreateFailed, '回调 body 缺少 resource');
    }

    try {
      // 真验签（await — SDK returns Promise<boolean>）
      const verified = await (this.pay as { verifySign: (p: unknown) => Promise<boolean> }).verifySign({
        timestamp: headers['wechatpay-timestamp'],
        nonce: headers['wechatpay-nonce'],
        body: JSON.stringify(body),
        serial: headers['wechatpay-serial'],
        signature: headers['wechatpay-signature'],
      });
      if (!verified) throw new AppError(ErrCode.WechatPayCreateFailed, '回调签名验证失败');

      // 解密 resource.ciphertext
      const decrypted = (this.pay as { decipher_gcm: <T>(ct: string, ad: string, n: string, k: string) => T }).decipher_gcm<{
        out_trade_no: string;
        trade_state: string;
      }>(resource.ciphertext, resource.associated_data, resource.nonce, this.cfg.apiV3Key);

      const success =
        (eventType === 'TRANSACTION.SUCCESS' || decrypted.trade_state === 'SUCCESS');

      return {
        orderNo: decrypted.out_trade_no,
        success,
      };
    } catch (e) {
      if (e instanceof AppError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      throw new AppError(ErrCode.WechatPayCreateFailed, `回调处理失败: ${msg}`);
    }
  }
}
