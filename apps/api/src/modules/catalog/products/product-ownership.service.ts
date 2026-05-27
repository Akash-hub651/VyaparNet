import { Injectable, ForbiddenException, PreconditionFailedException } from '@nestjs/common';
import { BusinessQueryService } from '../../identity/users/business-query.service';
import { RedisService } from '../../../core/redis/redis.service';
import { ProductsRepository } from './products.repository';
import { MediaRepository } from '../media/media.repository';
import { Business, Product, Media } from '@vyaparnet/database';

@Injectable()
export class ProductOwnershipService {
  constructor(
    private readonly businessQueryService: BusinessQueryService,
    private readonly productRepository: ProductsRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly redis: RedisService,
  ) {}

  /**
   * Resolves the business associated with a seller userId.
   * Caches the resolution for 300 seconds.
   * Throws PreconditionFailed if the user has no business.
   */
  async resolveSellerBusiness(userId: string): Promise<Business> {
    const cacheKey = `seller_business:${userId}`;
    const cached = await this.redis.getJson<Business>(cacheKey);
    if (cached) return cached;

    const business = await this.businessQueryService.findByOwnerId(userId);
    if (!business) {
      throw new PreconditionFailedException('User does not have an active business profile.');
    }

    await this.redis.setJson(cacheKey, business, 300);
    return business;
  }

  /**
   * Verifies that the given product belongs to the seller's business.
   */
  async verifyProductOwnership(userId: string, productId: string): Promise<{ product: Product; business: Business }> {
    const business = await this.resolveSellerBusiness(userId);
    const product = await this.productRepository.findById(productId);

    if (!product) {
      throw new ForbiddenException('Product not found or access denied.');
    }

    if (product.businessId !== business.id) {
      throw new ForbiddenException('You do not have permission to modify this product.');
    }

    return { product, business };
  }

  /**
   * Verifies that the media assets were uploaded by the same user.
   */
  async verifyMediaOwnership(userId: string, mediaIds: string[]): Promise<Media[]> {
    if (!mediaIds.length) return [];

    const mediaList = await this.mediaRepository.findByIds(mediaIds);

    if (mediaList.length !== mediaIds.length) {
      throw new ForbiddenException('One or more media items not found.');
    }

    for (const media of mediaList) {
      if (!media) {
        throw new ForbiddenException('One or more media items not found.');
      }
      if (media.uploadedBy !== userId) {
        throw new ForbiddenException(`Media access denied for item: ${media.id}`);
      }
    }

    return mediaList.filter((m): m is Media => !!m);
  }
}

