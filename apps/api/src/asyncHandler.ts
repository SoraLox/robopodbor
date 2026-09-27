import type { NextFunction, Request, RequestHandler, Response } from "express";

/*
  Express 4 не умеет перехватывать отказ промиса из async-обработчика: ошибка
  не доходит до error middleware в index.ts, запрос повисает без ответа, а Node
  начиная с 15-й версии гасит процесс на необработанном rejection. То есть один
  сбой БД укладывает весь API.

  Поэтому каждый async-обработчик оборачивается здесь: отказ уходит в next(),
  а дальше — в общий обработчик ошибок, который отвечает 500 и пишет лог.
*/
export function wrap(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
