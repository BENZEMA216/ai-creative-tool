import { z } from 'zod';

// 中国大陆手机号
const PHONE_RE = /^1[3-9]\d{9}$/;

export const sendCodeSchema = z.object({
  phone: z.string().regex(PHONE_RE, '请输入有效的手机号'),
});

export const loginSchema = z.object({
  phone: z.string().regex(PHONE_RE, '请输入有效的手机号'),
  code: z.string().regex(/^\d{6}$/, '验证码必须是 6 位数字'),
});

export type SendCodeInput = z.infer<typeof sendCodeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
