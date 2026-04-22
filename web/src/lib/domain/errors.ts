export enum ErrCode {
  Success = 0,

  // 1xxx 认证
  Unauthorized = 1001,
  TokenInvalid = 1002,
  AccountBanned = 1003,
  AdminPermissionDenied = 1004,

  // 2xxx 业务
  UnsupportedPlatform = 2001,
  VideoTooLong = 2002,
  VideoParseFailed = 2003,
  AudioExtractFailed = 2004,
  PointsInsufficient = 2010,
  PointsTxnConflict = 2011,
  OrderInvalid = 2020,

  // 3xxx 外部
  SmsSendFailed = 3001,
  WechatPayCreateFailed = 3002,
  WhisperFailed = 3003,
  YtdlpFailed = 3004,

  // 9xxx 系统
  InternalError = 9000,
  DependencyDown = 9001,
}

export class AppError extends Error {
  constructor(public readonly code: ErrCode, message: string) {
    super(message);
    this.name = 'AppError';
  }
}
