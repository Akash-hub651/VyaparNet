import { Module, Global } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';

import { metricProviders } from './metrics.providers';

/**
 * ObservabilityModule
 * 
 * Provides global Prometheus metrics and instrumentation for VyaparNet.
 * Exposes /metrics endpoint automatically via PrometheusModule.
 */
@Global()
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: process.env.NODE_ENV !== 'test',
      },
    }),
  ],
  providers: [MetricsService, ...metricProviders],
  exports: [MetricsService],
})
export class ObservabilityModule {}
