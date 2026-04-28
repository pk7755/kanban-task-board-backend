import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParseDateRangePipe implements PipeTransform<string, Date> {
  transform(value: string): Date {
    if (!value) return value as unknown as Date;
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new BadRequestException(
        `Invalid date format: "${value}". Use ISO 8601 (e.g. 2024-12-31 or 2024-12-31T23:59:59Z)`,
      );
    }
    return date;
  }
}
