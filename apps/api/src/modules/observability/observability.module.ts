import { Module, Global } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import * as promClient from 'prom-client';
import { MetricsService } from './metrics.service';

import { metricProviders } from './metrics.providers';

// Safe check to avoid multiple collectDefaultMetrics calls across HMR / module re-imports
if (process.env.NODE_ENV !== 'test') {
  const metricName = 'process_cpu_user_seconds_total';
  if (!promClient.register.getSingleMetric(metricName)) {
    promClient.collectDefaultMetrics();
  }
}

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
        enabled: false, // Managed manually above to avoid registration collisions
      },
    }),
  ],
  providers: [MetricsService, ...metricProviders],
  exports: [MetricsService, ...metricProviders],
})
export class ObservabilityModule {}

