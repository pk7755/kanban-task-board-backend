import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

export interface TransformedResponse<T> {
  data: T;
  statusCode: number;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  TransformedResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<TransformedResponse<T>> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      map((data) => ({
        data,
        statusCode: response.statusCode,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
