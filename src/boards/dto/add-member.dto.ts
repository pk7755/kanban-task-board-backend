import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class AddMemberDto {
  @ApiProperty({
    example: 'jane@example.com',
    description: 'Email of the user to add as a board member',
  })
  @IsEmail()
  email!: string;
}
