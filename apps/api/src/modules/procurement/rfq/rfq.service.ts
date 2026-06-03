import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RfqRepository } from './rfq.repository';
import { QuotationRepository } from './quotation.repository';
import {
  CreateRfqDto,
  CreateQuotationDto,
  NegotiatePriceDto,
  RfqConvertDto,
  SystemActorType,
} from '@vyaparnet/types';
import { Prisma, RfqStatus, QuotationStatus } from '@vyaparnet/database';
import { OrdersService } from '../../order/orders.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { MetricsService } from '../../observability/metrics.service';
import { Logger } from '@nestjs/common';

@Injectable()
export class RfqService {
  private readonly logger = new Logger(RfqService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rfqRepo: RfqRepository,
    private readonly quotationRepo: QuotationRepository,
    private readonly ordersService: OrdersService,
    private readonly auditSafeWriter: AuditSafeWriterService,
    private readonly metricsService: MetricsService,
  ) {}

  async createRfq(buyerId: string, dto: CreateRfqDto) {
    const rfq = await this.rfqRepo.create({
      buyerId,
      segment: dto.segment as any,
      items: dto.items,
      validUntil: new Date(dto.validUntil),
      status: RfqStatus.OPEN,
    });

    // ─── Phase 9: Observability (§20.1) ────────
    this.metricsService.rfqCreatedTotal.inc({ segment: dto.segment });

    this.logger.log({
      level: 'info',
      event: 'rfq.create',
      rfqId: rfq.id,
      actorId: buyerId,
      segment: dto.segment,
      msg: 'RFQ created successfully',
    });

    return rfq;
  }

  async getBuyerRfqs(buyerId: string) {
    return this.rfqRepo.findManyForBuyer(buyerId);
  }

  async getBuyerRfqDetails(rfqId: string, buyerId: string) {
    const rfq = await this.rfqRepo.findByIdForBuyer(rfqId, buyerId);
    if (!rfq) throw new NotFoundException('RFQ not found');
    return rfq;
  }

  async acceptQuotation(rfqId: string, quotationId: string, buyerId: string) {
    const quotation = await this.quotationRepo.findByIdForBuyer(
      quotationId,
      buyerId,
    );
    if (!quotation) throw new NotFoundException('Quotation not found');
    if (
      quotation.status !== QuotationStatus.NEGOTIATING &&
      quotation.status !== QuotationStatus.DRAFT
    ) {
      throw new BadRequestException(
        'Quotation is not in a valid state to be accepted',
      );
    }
    if (quotation.validUntil < new Date()) {
      throw new BadRequestException('Quotation has expired');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const accepted = await this.quotationRepo.updateStatus(
        quotationId,
        QuotationStatus.ACCEPTED_BY_BUYER,
        tx,
      );
      // Close other quotes
      await tx.quotation.updateMany({
        where: {
          rfqId,
          id: { not: quotationId },
          status: { not: QuotationStatus.EXPIRED },
        },
        data: { status: QuotationStatus.CANCELLED },
      });

      await tx.eventOutbox.create({
        data: {
          eventType: 'QuoteAccepted',
          payload: {
            rfqId,
            quotationId,
            buyerId,
          },
          schemaVersion: '8.0',
          eventVersion: '1.0',
          deduplicationKey: `QuoteAccepted:${quotationId}`,
          eventMonth: new Date().toISOString().substring(0, 7),
          status: 'PENDING',
        },
      });

      return accepted;
    });

    await this.auditSafeWriter.safeWrite({
      action: 'QUOTATION_ACCEPTED' as any,
      actorId: buyerId,
      entityId: quotationId,
      entityType: 'QUOTATION',
      newValue: { rfqId },
      actorRole: SystemActorType.USER,
    });

    // ─── Phase 9: Observability (§20.1) ────────
    this.metricsService.quoteAcceptedTotal.inc({ segment: quotation.segment });

    this.logger.log({
      level: 'info',
      event: 'rfq.quote_accepted',
      rfqId,
      quotationId,
      actorId: buyerId,
      segment: quotation.segment,
      msg: 'Quotation accepted by buyer',
    });

    return result;
  }

  async convertToOrder(
    _rfqId: string,
    quotationId: string,
    buyerId: string,
    dto: RfqConvertDto,
    ipAddress: string,
  ) {
    const order = await this.ordersService.createFromQuotation(
      quotationId,
      buyerId,
      {
        ...dto,
        clientIdempotencyKey: `convert-${quotationId}`,
      },
      ipAddress,
    );

    const quotation = await this.quotationRepo.findByIdForBuyer(
      quotationId,
      buyerId,
    );
    if (quotation) {
      this.metricsService.quoteConvertedToOrderTotal.inc({
        segment: quotation.segment,
      });
    }

    return order;
  }

  async getSellerRfqs(sellerId: string) {
    // 1. Get seller's business segment
    const business = await this.prisma.business.findFirst({
      where: { ownerId: sellerId },
    });
    if (!business) return [];

    // 2. Get seller's product catalog
    const products = await this.prisma.product.findMany({
      where: { businessId: business.id, isDeleted: false },
      select: { id: true },
    });
    const productIds = products.map((p) => p.id);
    if (productIds.length === 0) return [];

    // 3. Find matching RFQs via repository scoping (INV-S8-17)
    return this.rfqRepo.findManyForSeller(business.segment, productIds);
  }

  async submitQuotation(
    rfqId: string,
    sellerId: string,
    dto: CreateQuotationDto,
  ) {
    // KYC Gate (INV-S8-27)
    const business = await this.prisma.business.findFirst({
      where: { ownerId: sellerId },
    });
    if (!business || business.kycStatus !== 'VERIFIED') {
      throw new ForbiddenException('Only VERIFIED sellers can quote on RFQs');
    }

    const rfq = await this.rfqRepo.findById(rfqId);
    if (!rfq || rfq.status !== RfqStatus.OPEN) {
      throw new BadRequestException('RFQ is not open for quoting');
    }
    if (rfq.validUntil < new Date()) {
      throw new BadRequestException('RFQ quoting window has expired');
    }

    const quotation = await this.prisma.$transaction(async (tx) => {
      const q = await this.quotationRepo.create(
        {
          rfqId,
          buyerId: rfq.buyerId,
          sellerId: business.id,
          segment: business.segment,
          subtotal: new Prisma.Decimal(dto.subtotal),
          taxAmount: new Prisma.Decimal(dto.taxAmount),
          discount: new Prisma.Decimal(dto.discount || 0),
          grandTotal: new Prisma.Decimal(dto.grandTotal),
          validUntil: new Date(dto.validUntil),
          status: QuotationStatus.DRAFT,
          quoteMonth: new Date().toISOString().substring(0, 7),
          createdBy: sellerId,
        },
        dto.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          productSlug: item.productSlug,
          quantity: item.quantity,
          unitPrice: new Prisma.Decimal(item.unitPrice),
          totalPrice: new Prisma.Decimal(item.totalPrice),
          requestedPrice: item.requestedPrice
            ? new Prisma.Decimal(item.requestedPrice)
            : null,
        })),
        tx,
      );

      await tx.eventOutbox.create({
        data: {
          eventType: 'QuoteCreated',
          payload: {
            rfqId,
            quotationId: q.id,
            sellerId: business.id,
          },
          schemaVersion: '8.0',
          eventVersion: '1.0',
          deduplicationKey: `QuoteCreated:${q.id}`,
          eventMonth: new Date().toISOString().substring(0, 7),
          status: 'PENDING',
        },
      });

      return q;
    });

    // ─── Phase 9: Observability (§20.1) ────────
    this.metricsService.quoteSubmittedTotal.inc({ segment: business.segment });

    this.logger.log({
      level: 'info',
      event: 'rfq.quote_submitted',
      rfqId,
      quotationId: quotation.id,
      actorId: sellerId,
      segment: business.segment,
      msg: 'Quotation submitted by seller',
    });

    return quotation;
  }

  async negotiatePrice(
    quotationId: string,
    userId: string,
    actorType: 'BUYER' | 'SELLER',
    dto: NegotiatePriceDto,
  ) {
    let quotation;
    if (actorType === 'BUYER') {
      quotation = await this.quotationRepo.findByIdForBuyer(
        quotationId,
        userId,
      );
    } else {
      const business = await this.prisma.business.findFirst({
        where: { ownerId: userId },
      });
      if (!business) throw new ForbiddenException('Seller business not found');
      quotation = await this.quotationRepo.findByIdForSeller(
        quotationId,
        business.id,
      );
    }

    if (!quotation) throw new NotFoundException('Quotation not found');
    if (
      quotation.status !== QuotationStatus.DRAFT &&
      quotation.status !== QuotationStatus.NEGOTIATING
    ) {
      throw new BadRequestException('Cannot negotiate on this quotation');
    }
    if (quotation.validUntil < new Date()) {
      throw new BadRequestException('Quotation has expired');
    }

    // AppConfig based rounds limit
    const configRow = await this.prisma.appConfig.findUnique({
      where: { key: 'MAX_NEGOTIATION_ROUNDS' },
    });
    const maxRounds = configRow ? parseInt(configRow.value, 10) : 3;

    if (quotation.negotiations.length >= maxRounds) {
      throw new BadRequestException(
        `Maximum negotiation rounds (${maxRounds}) exceeded`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const neg = await this.quotationRepo.addNegotiation(
        quotation.id,
        new Prisma.Decimal(dto.proposedPrice),
        userId,
        dto.message,
        tx,
      );

      if (quotation.status === QuotationStatus.DRAFT) {
        await this.quotationRepo.updateStatus(
          quotation.id,
          QuotationStatus.NEGOTIATING,
          tx,
        );
      }
      return neg;
    });

    return result;
  }
}
