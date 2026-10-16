/** Erro de regra de negócio: a mensagem é mostrada ao usuário. */
export class BusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessError";
  }
}
