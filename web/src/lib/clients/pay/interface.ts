export interface CreateOrderInput {
  orderNo: string;
  amountYuan: number;
  description: string;
  notifyUrl: string;
}

export interface CreateOrderResult {
  qrCodeUrl: string;
  prepayId: string;
}

export interface CreateH5OrderInput extends CreateOrderInput {
  /** 客户端 IP（从 req headers 提取） */
  clientIp: string;
  /** H5 场景类型 */
  h5Type?: 'Wap' | 'iOS' | 'Android';
  appName?: string;
  appUrl?: string;
}

export interface CreateH5OrderResult {
  h5Url: string;
  prepayId: string;
}

export interface VerifiedCallback {
  orderNo: string;
  success: boolean;
}

export interface QueryOrderResult {
  /** WeChat says payment succeeded */
  paid: boolean;
  /** Raw trade_state for logging: SUCCESS / REFUND / NOTPAY / CLOSED / ... */
  trade_state?: string;
}

export interface PayClient {
  createNativeOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  createH5Order(input: CreateH5OrderInput): Promise<CreateH5OrderResult>;
  verifyCallback(headers: Record<string, string | undefined>, body: unknown): Promise<VerifiedCallback>;
  /**
   * Actively query payment status from WeChat (for bypassing callback when
   * notify_url is not publicly reachable).
   */
  queryOrder(orderNo: string): Promise<QueryOrderResult>;
}
