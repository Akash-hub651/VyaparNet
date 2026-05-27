import { Module, Global } from '@nestjs/common';
import { CatalogMetrics } from './catalog-metrics.service';

/**
 * CatalogMetricsModule provides the CatalogMetrics service.
 * Using a clean, non-circular architecture, catalog submodules can import this module safely.
 */
@Global()
@Module({
  providers: [CatalogMetrics],
  exports: [CatalogMetrics],
})
export class CatalogMetricsModule {}
