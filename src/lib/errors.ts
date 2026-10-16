/** Erro de regra de negócio: a mensagem é mostrada ao usuário. `code` permite à tela reagir (ex.: pedir senha do gerente). */
export class BusinessError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}
