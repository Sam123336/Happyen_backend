import {
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { z, type ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  public constructor(
    private readonly schema: ZodType,
    private readonly message = 'The request body is invalid',
  ) {}

  public transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'validation_failed',
        details: z.treeifyError(result.error),
        message: this.message,
      });
    }
    return result.data;
  }
}
