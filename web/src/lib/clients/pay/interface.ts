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

export interface PayClient {
  createNativeOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  verifyCallback(headers: Record<string, string | undefined>, body: unknown): VerifiedCallback;
}
