import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';
import { ZodSchema } from 'zod';

/**
 * Zod Validation Pipe
 *
 * Validates incoming DTOs against Zod schemas.
 * Returns standardized error response on validation failure.
 *
 * Usage (Sprint 1+):
 *   @UsePipes(new ZodValidationPipe(SendOtpSchema))
 *   async sendOtp(@Body() dto: SendOtpDto) {}
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 10
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.');
        fields[path] = issue.message;
      }

      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: { fields },
      });
    }

    return result.data;
  }
}
