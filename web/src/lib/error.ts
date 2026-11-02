// src/lib/errors.ts
/** 업무 규칙 위반. message는 사용자에게 그대로 보여 줘도 되는 문장으로 쓴다 */

export class BusinessError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}
