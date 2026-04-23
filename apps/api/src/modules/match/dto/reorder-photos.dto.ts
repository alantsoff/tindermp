import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class ReorderPhotosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  order!: string[];
}
