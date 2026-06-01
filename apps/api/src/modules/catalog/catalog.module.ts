import { Module } from '@nestjs/common';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { MediaModule } from './media/media.module';
import { SearchModule } from './search/search.module';
import { CatalogMetricsModule } from './catalog-metrics.module';

@Module({
  imports: [
    CatalogMetricsModule,
    CategoriesModule,
    ProductsModule,
    MediaModule,
    SearchModule,
  ],
  exports: [CatalogMetricsModule, ProductsModule, CategoriesModule],
})
export class CatalogModule {}
