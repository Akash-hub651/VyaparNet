import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { UserRole, Segment, Product } from '@vyaparnet/database';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../../shared/guards/roles.guard';
import { Roles } from '../../../shared/decorators/roles.decorator';
import { CurrentUser } from '../../../shared/decorators/current-user.decorator';
import { BaseProductDto } from '@vyaparnet/types';

@Controller('v1/products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.SELLER)
  async createProduct(
    @Body() dto: BaseProductDto & { segment: Segment },
    @CurrentUser() user: any,
  ): Promise<Product> {
    return this.productsService.createProduct(dto, user.id, user.role);
  }

  @Post(':id/publish')
  @Roles(UserRole.SELLER)
  async publishProduct(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<Product> {
    return this.productsService.publishProduct(id, user.id, user.role);
  }

  @Get()
  async listProducts(@Query('segment') _segment: Segment) {
    throw new Error(
      'Not Implemented: Use Search module for listing (Phase 6).',
    );
  }

  @Get('seller')
  @Roles(UserRole.SELLER)
  async listSellerProducts() {
    throw new Error('Not Implemented');
  }

  @Get(':id')
  async getProduct(
    @Param('id') id: string,
    @Query('segment') segment?: Segment,
  ): Promise<Product> {
    return this.productsService.getProduct(id, segment);
  }

  @Put(':id')
  @Roles(UserRole.SELLER)
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: Partial<BaseProductDto & { segment: Segment }>,
    @CurrentUser() user: any,
  ): Promise<Product> {
    return this.productsService.updateProduct(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(UserRole.SELLER)
  async deleteProduct(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<Product> {
    return this.productsService.deleteProduct(id, user.id);
  }
}
