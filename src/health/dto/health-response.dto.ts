import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({
    example: 'ok',
    description: 'Database connection status: ok or error',
  })
  db!: string;

  @ApiProperty({ example: 123.45, description: 'Process uptime in seconds' })
  uptime!: number;
}
