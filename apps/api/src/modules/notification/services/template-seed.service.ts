import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NotificationChannel, NotificationType } from '@vyaparnet/database';
import { PrismaService } from '../../../core/prisma/prisma.service';

/**
 * Shape for defining a template in this seed service.
 * Matches the NotificationTemplate Prisma model exactly.
 */
interface TemplateDefinition {
  name: string;
  type: NotificationType;
  channels: NotificationChannel[];
  titleHi: string;
  bodyHi: string;
  titleEn: string;
  bodyEn: string;
  isActive: boolean;
}

/**
 * TemplateSeedService — seeds NotificationTemplate records at app startup.
 *
 * GOVERNANCE (INV-S6-28):
 * - upsert update MUST contain ONLY `{ isActive: template.isActive }`.
 * - NEVER include bodyHi, bodyEn, titleHi, titleEn in the update object.
 * - Template content is deploy-time data — overwriting on startup corrupts production content.
 * - FOOTGUN-2-D: If you add body/title fields to `update:`, every restart silently
 *   overwrites live template content that may have been manually corrected in production.
 *
 * Template naming convention: {EventType}_{Role}_{Lang}
 * Examples: OrderCreated_BUYER_hi, OrderShipped_BUYER_en
 *
 * Variables are delimited by double curly braces: {{variableName}}
 * TemplateService.render() substitutes these safely with sanitized values.
 */
@Injectable()
export class TemplateSeedService implements OnModuleInit {
  private readonly logger = new Logger(TemplateSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Runs at module init — idempotent, safe to run on every deployment */
  async onModuleInit(): Promise<void> {
    await this.seedTemplates();
  }

  private async seedTemplates(): Promise<void> {
    const templates = this.getTemplateDefinitions();
    let seeded = 0;

    for (const template of templates) {
      await this.prisma.notificationTemplate.upsert({
        where: { name: template.name },
        // INV-S6-28: ONLY toggle isActive. NEVER overwrite body/title on re-seed.
        // Template content = deploy decision, not startup side-effect.
        update: { isActive: template.isActive },
        create: template,
      });
      seeded++;
    }

    this.logger.log({ count: seeded }, 'NOTIFICATION_TEMPLATES_SEEDED');
  }

  /**
   * Returns all NotificationTemplate definitions from §3.4 of the execution lock.
   *
   * Variable substitution tokens: {{variableName}} — rendered safely by TemplateService.
   * Hindi (hi) templates are the primary language for VyaparNet B2B sellers/buyers.
   * English (en) templates required for SMS and Email channels.
   */
  private getTemplateDefinitions(): TemplateDefinition[] {
    return [
      // ─── ORDER: OrderCreated ────────────────────────────────────────────────
      {
        name: 'OrderCreated_BUYER_hi',
        type: NotificationType.ORDER,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        titleHi: 'Order place ho gaya!',
        bodyHi: 'Aapka order #{{orderNumber}} place ho gaya hai. Amount: ₹{{grandTotal}}',
        titleEn: 'Order Placed!',
        bodyEn: 'Your order #{{orderNumber}} has been placed. Amount: ₹{{grandTotal}}',
        isActive: true,
      },
      {
        name: 'OrderCreated_SELLER_hi',
        type: NotificationType.ORDER,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        titleHi: 'Naya order aaya!',
        bodyHi: 'Order #{{orderNumber}} aaya hai. Amount: ₹{{grandTotal}}. Abhi confirm karein.',
        titleEn: 'New Order Received!',
        bodyEn: 'Order #{{orderNumber}} received. Amount: ₹{{grandTotal}}. Please confirm now.',
        isActive: true,
      },

      // ─── ORDER: OrderStatusChanged → CONFIRMED ──────────────────────────────
      {
        name: 'OrderConfirmed_BUYER_hi',
        type: NotificationType.ORDER,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP],
        titleHi: 'Order confirm ho gaya!',
        bodyHi: '#{{orderNumber}} - Seller ne aapka order accept kar liya!',
        titleEn: 'Order Confirmed!',
        bodyEn: '#{{orderNumber}} - Your order has been confirmed by the seller!',
        isActive: true,
      },

      // ─── ORDER: OrderStatusChanged → PROCESSING ─────────────────────────────
      {
        name: 'OrderProcessing_BUYER_hi',
        type: NotificationType.ORDER,
        channels: [NotificationChannel.IN_APP],
        titleHi: 'Order pack ho raha hai',
        bodyHi: '#{{orderNumber}} - Aapka order pack ho raha hai.',
        titleEn: 'Order Being Packed',
        bodyEn: '#{{orderNumber}} - Your order is being packed.',
        isActive: true,
      },

      // ─── ORDER: OrderStatusChanged → SHIPPED ────────────────────────────────
      {
        name: 'OrderShipped_BUYER_hi',
        type: NotificationType.ORDER,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP],
        titleHi: 'Order ship ho gaya!',
        bodyHi: '#{{orderNumber}} ship ho gaya! Tracking: {{trackingNumber}}',
        titleEn: 'Order Shipped!',
        bodyEn: '#{{orderNumber}} has been shipped! Tracking: {{trackingNumber}}',
        isActive: true,
      },

      // ─── ORDER: OrderStatusChanged → OUT_FOR_DELIVERY ───────────────────────
      {
        name: 'OrderOutForDelivery_BUYER_hi',
        type: NotificationType.ORDER,
        channels: [NotificationChannel.IN_APP],
        titleHi: 'Order delivery ke liye nikla!',
        bodyHi: '#{{orderNumber}} delivery boy ke paas hai. Aaj deliver hoga.',
        titleEn: 'Out for Delivery',
        bodyEn: '#{{orderNumber}} is out for delivery. Expect it today.',
        isActive: true,
      },

      // ─── ORDER: OrderStatusChanged → DELIVERED ──────────────────────────────
      {
        name: 'OrderDelivered_BUYER_hi',
        type: NotificationType.ORDER,
        channels: [NotificationChannel.IN_APP],
        titleHi: 'Order deliver ho gaya!',
        bodyHi: '#{{orderNumber}} aapko deliver ho gaya. Seller ko rate karein!',
        titleEn: 'Order Delivered!',
        bodyEn: '#{{orderNumber}} has been delivered. Please rate the seller!',
        isActive: true,
      },

      // ─── PAYMENT: PaymentReceived ────────────────────────────────────────────
      {
        name: 'PaymentReceived_BUYER_hi',
        type: NotificationType.PAYMENT,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        titleHi: 'Payment successful!',
        bodyHi: '#{{orderNumber}} ke liye ₹{{amount}} ka payment receive ho gaya.',
        titleEn: 'Payment Successful!',
        bodyEn: 'Payment of ₹{{amount}} received for order #{{orderNumber}}.',
        isActive: true,
      },

      // ─── PAYMENT: PaymentFailed ──────────────────────────────────────────────
      {
        name: 'PaymentFailed_BUYER_hi',
        type: NotificationType.PAYMENT,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        titleHi: 'Payment fail ho gayi',
        // §11.1 AUDIT FIX: {{reason}} added so buyer sees why payment failed (INV-S6-14: safe substitution)
        bodyHi: '#{{orderNumber}} ka payment fail ho gaya. Reason: {{reason}}. Retry karein.',
        titleEn: 'Payment Failed',
        bodyEn: 'Payment for order #{{orderNumber}} failed. Reason: {{reason}}. Please retry.',
        isActive: true,
      },

      // ─── SYSTEM: SupplierScoreUpdated → Improved ────────────────────────────
      // INV-S6-10: Only sent when |delta| >= 5 (filter in NotificationWorker, not here)
      {
        name: 'ScoreImproved_SELLER_hi',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP],
        titleHi: 'Score badh gaya!',
        bodyHi: 'Aapka supplier score {{compositeScore}} ho gaya! Pehle {{previousCompositeScore}} tha.',
        titleEn: 'Score Improved!',
        bodyEn: 'Your supplier score improved to {{compositeScore}} from {{previousCompositeScore}}.',
        isActive: true,
      },

      // ─── SYSTEM: SupplierScoreUpdated → Dropped ─────────────────────────────
      {
        name: 'ScoreDropped_SELLER_hi',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP],
        titleHi: 'Score gir gaya',
        bodyHi: 'Aapka score {{previousCompositeScore}} se {{compositeScore}} ho gaya. Improvement karein!',
        titleEn: 'Score Dropped',
        bodyEn: 'Your supplier score dropped from {{previousCompositeScore}} to {{compositeScore}}. Please improve!',
        isActive: true,
      },

      // ─── INVENTORY: StockLow ─────────────────────────────────────────────────
      // INV-S6-11: Max 1 SMS per (productId, businessId) per 24h — enforced in handler
      {
        name: 'StockLow_SELLER_hi',
        type: NotificationType.INVENTORY,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP],
        titleHi: 'Stock kam ho raha hai',
        bodyHi: '{{productName}} ka stock sirf {{stockQty}} reh gaya hai. Update karein.',
        titleEn: 'Low Stock Alert',
        bodyEn: '{{productName}} stock is down to {{stockQty}} units. Please restock.',
        isActive: true,
      },

      // ─── English fallbacks for key SMS/Email events ──────────────────────────
      {
        name: 'OrderCreated_BUYER_en',
        type: NotificationType.ORDER,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        titleHi: 'Order place ho gaya!',
        bodyHi: 'Aapka order #{{orderNumber}} place ho gaya hai. Amount: ₹{{grandTotal}}',
        titleEn: 'Order Placed!',
        bodyEn: 'Your order #{{orderNumber}} has been placed. Amount: ₹{{grandTotal}}',
        isActive: true,
      },
      {
        name: 'OrderShipped_BUYER_en',
        type: NotificationType.ORDER,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP],
        titleHi: 'Order ship ho gaya!',
        bodyHi: '#{{orderNumber}} ship ho gaya! Tracking: {{trackingNumber}}',
        titleEn: 'Order Shipped!',
        bodyEn: '#{{orderNumber}} has been shipped! Tracking: {{trackingNumber}}',
        isActive: true,
      },
      {
        name: 'PaymentFailed_BUYER_en',
        type: NotificationType.PAYMENT,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        titleHi: 'Payment fail ho gayi',
        bodyHi: '#{{orderNumber}} ka payment fail ho gaya. Retry karein.',
        titleEn: 'Payment Failed',
        bodyEn: 'Payment for order #{{orderNumber}} failed. Please retry.',
        isActive: true,
      },
    ];
  }
}
