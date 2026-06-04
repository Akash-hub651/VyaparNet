import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { BuyerRfqController } from './rfq/buyer-rfq.controller';
import { SellerRfqController } from './rfq/seller-rfq.controller';
import { BuyerProcurementTemplateController } from './templates/buyer-template.controller';
import { RfqService } from './rfq/rfq.service';
import { ProcurementTemplateService } from './templates/procurement-template.service';
import { RfqRepository } from './rfq/rfq.repository';
import { QuotationRepository } from './rfq/quotation.repository';
import { ProcurementTemplateRepository } from './templates/procurement-template.repository';
import { QuoteExpiryWorker } from './workers/quote-expiry.worker';
import { OrderModule } from '../order/order.module';
import { NotificationModule } from '../notification/notification.module';
import { ObservabilityModule } from '../observability/observability.module';
import { AuditModule } from '../security/audit/audit.module';

@Module({
  imports: [
    OrderModule,
    NotificationModule,
    ObservabilityModule,
    AuditModule,
    BullModule.registerQueue({
      name: 'quote-expiry',
    }),
  ],
  controllers: [
    BuyerRfqController,
    SellerRfqController,
    BuyerProcurementTemplateController,
  ],
  providers: [
    RfqService,
    ProcurementTemplateService,
    RfqRepository,
    QuotationRepository,
    ProcurementTemplateRepository,
    QuoteExpiryWorker,
  ],
  exports: [RfqService],
})
export class ProcurementModule {}
