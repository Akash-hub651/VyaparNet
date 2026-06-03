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
import { DisputesService } from './disputes.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  CreateDisputeDto,
  CreateDisputeDtoSchema,
  DisputeResponseDto,
} from '@vyaparnet/types';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';

import { FileInterceptor } from '@nestjs/platform-express';

@Controller('buyer/disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('BUYER')
export class DisputesController {
  constructor(
    private readonly disputesService: DisputesService,
    private readonly evidenceService: EvidenceService,
  ) {}

  @Post()
  async createDispute(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreateDisputeDtoSchema)) dto: CreateDisputeDto,
  ): Promise<DisputeResponseDto> {
    const buyerId = req.user.id;
    return this.disputesService.createDispute(buyerId, dto);
  }

  @Get()
  async getDisputes(@Req() req: any): Promise<DisputeResponseDto[]> {
    const buyerId = req.user.id;
    return this.disputesService.getDisputesForBuyer(buyerId);
  }

  @Get(':id')
  async getDisputeById(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<DisputeResponseDto> {
    const buyerId = req.user.id;
    return this.disputesService.getDisputeById(id, buyerId);
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
    await this.disputesService.getDisputeById(id, buyerId);

    const key = await this.evidenceService.uploadEvidence(
      'dispute',
      id,
      file.buffer,
      file.originalname,
    );

    return { key };
  }
}
