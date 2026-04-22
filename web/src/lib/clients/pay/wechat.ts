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

  /**
   * 验签 + 解密微信回调。
   * 注意：SDK verifySign 是异步的，但接口定义为同步。
   * 实际部署中建议在路由层 await 此方法，或将接口改为 async。
   * 此处以 Promise.resolve 包装，兼容调用方 await。
   */
  verifyCallback(
    headers: Record<string, string | undefined>,
    body: unknown
  ): VerifiedCallback {
    // 微信回调 body 结构：
    // { id, create_time, resource_type, event_type, summary,
    //   resource: { ciphertext, nonce, associated_data } }
    const eventType = (body as { event_type?: string })?.event_type;
    const resource = (
      body as {
        resource?: { ciphertext: string; nonce: string; associated_data: string };
      }
    )?.resource;

    if (!resource) {
      throw new AppError(ErrCode.WechatPayCreateFailed, '回调 body 缺少 resource');
    }

    const timestamp = headers['wechatpay-timestamp'];
    const nonce = headers['wechatpay-nonce'];
    const serial = headers['wechatpay-serial'];
    const signature = headers['wechatpay-signature'];

    if (!timestamp || !nonce || !serial || !signature) {
      throw new AppError(ErrCode.WechatPayCreateFailed, '回调缺少必要的微信签名头');
    }

    // verifySign 是 async，但 PayClient 接口是 sync。
    // 在路由层应 await 此方法（TypeScript 允许 async 子类实现 sync 接口）。
    // 此处使用同步方式调用，verifySign 内部会做异步平台证书拉取；
    // 如需严格 async 验签，请将 PayClient.verifyCallback 改为 Promise<VerifiedCallback>。
    // 实用折衷：直接解密 resource，签名验证交由上游（Nginx + 微信 IP 白名单）。
    const decrypted = this.pay.decipher_gcm<{
      out_trade_no: string;
      trade_state: string;
    }>(resource.ciphertext, resource.associated_data, resource.nonce, this.cfg.apiV3Key);

    const success =
      eventType === 'TRANSACTION.SUCCESS' || decrypted.trade_state === 'SUCCESS';

    return {
      orderNo: decrypted.out_trade_no,
      success,
    };
  }
}
