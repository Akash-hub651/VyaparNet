import { Controller, Get, Param, Query, ParseEnumPipe } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Segment } from '@vyaparnet/types';
import { Public } from '../../../shared/decorators/public.decorator';

@Controller('v1/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  async getTree(
    @Query('segment', new ParseEnumPipe(Segment)) segment: Segment,
  ) {
    return this.categoriesService.getTree(segment);
  }

  @Public()
  @Get(':id')
  async getById(
    @Param('id') id: string,
    @Query('segment', new ParseEnumPipe(Segment)) segment: Segment,
  ) {
    return this.categoriesService.getById(id, segment);
  }
}
