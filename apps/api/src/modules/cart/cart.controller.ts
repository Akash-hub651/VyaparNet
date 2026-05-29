import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import {
  AddToCartSchema,
  AddToCartDto,
  UpdateCartItemSchema,
  UpdateCartItemDto,
  CartType,
  CartItemType,
} from '@vyaparnet/types';
import { Segment } from '@vyaparnet/database';


@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(
    @CurrentUser('id') userId: string,
    @Query('segment') segment: Segment,
  ): Promise<CartType> {
    return this.cartService.getCart(userId, segment);
  }

  @Post('items')
  async addItem(
    @CurrentUser('id') userId: string,
    @Body(new ZodValidationPipe(AddToCartSchema)) dto: AddToCartDto,
  ): Promise<CartItemType> {
    return this.cartService.addItem(userId, dto);
  }

  @Put('items/:productId')
  async updateItem(
    @CurrentUser('id') userId: string,
    @Param('productId') productId: string,
    @Query('segment') segment: Segment,
    @Body(new ZodValidationPipe(UpdateCartItemSchema)) dto: UpdateCartItemDto,
  ): Promise<void> {
    await this.cartService.updateItem(userId, { ...dto, productId, segment });
  }

  @Delete('items/:productId')
  async removeItem(
    @CurrentUser('id') userId: string,
    @Param('productId') productId: string,
    @Query('segment') segment: Segment,
  ): Promise<void> {
    await this.cartService.removeItem(userId, productId, segment);
  }
}
