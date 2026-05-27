import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';
import { ProductApprovalService } from './product-approval.service';
import { ProductEventsService } from './product-events.service';
import { ProductOwnershipService } from './product-ownership.service';
import { ProductStateMachineService } from './product-state-machine.service';
import { SegmentProductSchemaRegistry } from './segment-product-schema.registry';
import { SegmentAttributeSchemaRepository } from './segment-attribute-schema.repository';
import { SegmentApprovalPolicyRepository } from './segment-approval-policy.repository';
import { MediaClassificationService } from '../media/media-classification.service';
import { CategoriesModule } from '../categories/categories.module';
import { MediaModule } from '../media/media.module';
import { IdentityModule } from '../../identity/identity.module';
import { CatalogMetricsModule } from '../catalog-metrics.module';

@Module({
  imports: [CategoriesModule, MediaModule, IdentityModule, CatalogMetricsModule],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    ProductOwnershipService,
    ProductApprovalService,
    ProductStateMachineService,
    ProductEventsService,
    ProductsRepository,
    SegmentAttributeSchemaRepository,
    SegmentApprovalPolicyRepository,
    SegmentProductSchemaRegistry,
    MediaClassificationService,
  ],
  exports: [
    ProductsService,
    ProductsRepository,
    ProductStateMachineService,
    SegmentProductSchemaRegistry,
  ],
})
export class ProductsModule {}

