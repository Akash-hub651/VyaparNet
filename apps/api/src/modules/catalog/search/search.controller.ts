import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { SearchService } from './search.service';
import { Segment } from '@vyaparnet/database';

@Controller('v1/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('products')
  async searchProducts(
    @Query('q') q: string,
    @Query('segment') segment: Segment,
    @Query('categoryId') categoryId?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursorBase64?: string,
  ) {
    if (!segment) {
      throw new BadRequestException('segment query parameter is required');
    }

    let cursor = undefined;
    if (cursorBase64) {
      try {
        const decoded = Buffer.from(cursorBase64, 'base64').toString('ascii');
        cursor = JSON.parse(decoded);
      } catch (e) {
        throw new BadRequestException('Invalid cursor format');
      }
    }

    const dto = {
      q,
      segment,
      categoryId,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      limit: limit ? parseInt(limit, 10) : 20,
      cursor,
    };

    // Stubs userId integration for Sprint 2
    return this.searchService.searchProducts(dto, undefined, 'buyer');
  }

  @Get('suggestions')
  async getSuggestions(
    @Query('q') q: string,
    @Query('segment') segment: Segment,
  ) {
    if (!segment) {
      throw new BadRequestException('segment query parameter is required');
    }
    return this.searchService.getSuggestions(q, segment);
  }
}
