import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ProcurementTemplateRepository } from './procurement-template.repository';
import { CreateProcurementTemplateDto, UpdateProcurementTemplateDto } from '@vyaparnet/types';
import { ProcurementTemplate } from '@vyaparnet/database';

@Injectable()
export class ProcurementTemplateService {
  constructor(
    private readonly templateRepo: ProcurementTemplateRepository
  ) {}

  private validatePayloadSize(dto: any) {
    const payloadString = JSON.stringify(dto);
    const sizeInBytes = Buffer.byteLength(payloadString, 'utf8');
    const MAX_SIZE = 256 * 1024; // 256 KB
    if (sizeInBytes > MAX_SIZE) {
      throw new BadRequestException('Template payload exceeds maximum allowed size of 256KB');
    }
  }

  async createTemplate(buyerId: string, dto: CreateProcurementTemplateDto): Promise<ProcurementTemplate> {
    this.validatePayloadSize(dto);

    if (dto.items.length < 1 || dto.items.length > 100) {
      throw new BadRequestException('Template items count must be between 1 and 100');
    }

    return this.templateRepo.create({
      buyerId,
      name: dto.name,
      segment: dto.segment as any,
      items: dto.items,
    });
  }

  async getBuyerTemplates(buyerId: string): Promise<ProcurementTemplate[]> {
    return this.templateRepo.findManyForBuyer(buyerId);
  }

  async getTemplateDetails(id: string, buyerId: string): Promise<ProcurementTemplate> {
    const template = await this.templateRepo.findByIdForBuyer(id, buyerId);
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async updateTemplate(id: string, buyerId: string, dto: UpdateProcurementTemplateDto): Promise<ProcurementTemplate> {
    this.validatePayloadSize(dto);
    const template = await this.templateRepo.findByIdForBuyer(id, buyerId);
    if (!template) throw new NotFoundException('Template not found');

    if (dto.items) {
      if (dto.items.length < 1 || dto.items.length > 100) {
        throw new BadRequestException('Template items count must be between 1 and 100');
      }
    }

    return this.templateRepo.update(id, {
      ...(dto.name && { name: dto.name }),
      ...(dto.items && { items: dto.items }),
    });
  }

  async deleteTemplate(id: string, buyerId: string): Promise<ProcurementTemplate> {
    const template = await this.templateRepo.findByIdForBuyer(id, buyerId);
    if (!template) throw new NotFoundException('Template not found');
    
    return this.templateRepo.softDelete(id);
  }
}
