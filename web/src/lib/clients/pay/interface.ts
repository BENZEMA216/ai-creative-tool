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
  verifyCallback(headers: Record<string, string | undefined>, body: unknown): Promise<VerifiedCallback>;
  /**
   * Actively query payment status from WeChat (for bypassing callback when
   * notify_url is not publicly reachable).
   */
  queryOrder(orderNo: string): Promise<QueryOrderResult>;
}
