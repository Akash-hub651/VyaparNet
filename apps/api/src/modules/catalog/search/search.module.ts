import { Module } from '@nestjs/common';
import { SearchNormalizerService } from './search-normalizer.service';
import { SearchCacheService } from './search-cache.service';
import { PostgresSearchEngine, SEARCH_ENGINE } from './postgres-search.engine';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { SearchReindexWorker } from './search-reindex.worker';
import { CatalogMetricsModule } from '../catalog-metrics.module';

@Module({
  imports: [CatalogMetricsModule],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchNormalizerService,
    SearchCacheService,
    {
      provide: SEARCH_ENGINE,
      useClass: PostgresSearchEngine,
    },
    PostgresSearchEngine,
    SearchReindexWorker,
  ],
  exports: [SearchService],
})
export class SearchModule {}
