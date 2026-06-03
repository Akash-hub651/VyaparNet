import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  CreateReturnDto,
  CreateReturnDtoSchema,
  ReturnResponseDto,
} from '@vyaparnet/types';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';

import { FileInterceptor } from '@nestjs/platform-express';

@Controller('buyer/returns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('BUYER')
export class ReturnsController {
  constructor(
    private readonly returnsService: ReturnsService,
    private readonly evidenceService: EvidenceService,
  ) {}

  @Post()
  async createReturn(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreateReturnDtoSchema)) dto: CreateReturnDto,
  ): Promise<ReturnResponseDto> {
    const buyerId = req.user.id;
    return this.returnsService.createReturnRequest(buyerId, dto);
  }

  @Get()
  async getReturns(@Req() req: any): Promise<ReturnResponseDto[]> {
    const buyerId = req.user.id;
    return this.returnsService.getReturnsForBuyer(buyerId);
  }

  @Get(':id')
  async getReturnById(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<ReturnResponseDto> {
    const buyerId = req.user.id;
    return this.returnsService.getReturnById(id, buyerId);
  }

  @Post(':id/evidence')
  @UseInterceptors(FileInterceptor('file'))
  async uploadEvidence(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');

    const buyerId = req.user.id;
    // Check ownership before uploading evidence
    await this.returnsService.getReturnById(id, buyerId);

    const key = await this.evidenceService.uploadEvidence(
      'return',
      id,
      file.buffer,
      file.originalname,
    );

    return { key };
  }
}
