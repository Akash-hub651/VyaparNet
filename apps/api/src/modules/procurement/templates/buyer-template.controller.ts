import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ProcurementTemplateService } from './procurement-template.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import {
  CreateProcurementTemplateDto,
  CreateProcurementTemplateSchema,
  UpdateProcurementTemplateDto,
  UpdateProcurementTemplateSchema,
} from '@vyaparnet/types';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { ProcurementTemplate } from '@vyaparnet/database';

@Controller('buyer/procurement/templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('BUYER')
export class BuyerProcurementTemplateController {
  constructor(private readonly templateService: ProcurementTemplateService) {}

  @Post()
  async createTemplate(
    @Req() req: any,
    @Body(new ZodValidationPipe(CreateProcurementTemplateSchema))
    dto: CreateProcurementTemplateDto,
  ): Promise<ProcurementTemplate> {
    return this.templateService.createTemplate(req.user.id, dto);
  }

  @Get()
  async getTemplates(@Req() req: any): Promise<ProcurementTemplate[]> {
    return this.templateService.getBuyerTemplates(req.user.id);
  }

  @Get(':id')
  async getTemplate(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<ProcurementTemplate> {
    return this.templateService.getTemplateDetails(id, req.user.id);
  }

  @Put(':id')
  async updateTemplate(
    @Req() req: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProcurementTemplateSchema))
    dto: UpdateProcurementTemplateDto,
  ): Promise<ProcurementTemplate> {
    return this.templateService.updateTemplate(id, req.user.id, dto);
  }

  @Delete(':id')
  async deleteTemplate(
    @Req() req: any,
    @Param('id') id: string,
  ): Promise<ProcurementTemplate> {
    return this.templateService.deleteTemplate(id, req.user.id);
  }
}
