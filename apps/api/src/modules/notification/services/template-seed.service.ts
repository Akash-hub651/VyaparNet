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
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Order place ho gaya!',
        bodyHi:
          'Aapka order #{{orderNumber}} place ho gaya hai. Amount: ₹{{grandTotal}}',
        titleEn: 'Order Placed!',
        bodyEn:
          'Your order #{{orderNumber}} has been placed. Amount: ₹{{grandTotal}}',
        isActive: true,
      },
      {
        name: 'OrderCreated_SELLER_hi',
        type: NotificationType.ORDER,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Naya order aaya!',
        bodyHi:
          'Buyer ({{buyerCode}}) se order #{{orderNumber}} aaya hai. Amount: ₹{{grandTotal}}. Abhi confirm karein.',
        titleEn: 'New Order Received!',
        bodyEn:
          'Order #{{orderNumber}} received from buyer ({{buyerCode}}). Amount: ₹{{grandTotal}}. Please confirm now.',
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
        bodyEn:
          '#{{orderNumber}} - Your order has been confirmed by the seller!',
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
        bodyEn:
          '#{{orderNumber}} has been shipped! Tracking: {{trackingNumber}}',
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
        bodyHi:
          '#{{orderNumber}} aapko deliver ho gaya. Seller ko rate karein!',
        titleEn: 'Order Delivered!',
        bodyEn: '#{{orderNumber}} has been delivered. Please rate the seller!',
        isActive: true,
      },

      // ─── PAYMENT: PaymentReceived ────────────────────────────────────────────
      {
        name: 'PaymentReceived_BUYER_hi',
        type: NotificationType.PAYMENT,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Payment successful!',
        bodyHi:
          '#{{orderNumber}} ke liye ₹{{amount}} ka payment receive ho gaya.',
        titleEn: 'Payment Successful!',
        bodyEn: 'Payment of ₹{{amount}} received for order #{{orderNumber}}.',
        isActive: true,
      },

      // ─── PAYMENT: PaymentFailed ──────────────────────────────────────────────
      {
        name: 'PaymentFailed_BUYER_hi',
        type: NotificationType.PAYMENT,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Payment fail ho gayi',
        // §11.1 AUDIT FIX: {{reason}} added so buyer sees why payment failed (INV-S6-14: safe substitution)
        bodyHi:
          '#{{orderNumber}} ka payment fail ho gaya. Reason: {{reason}}. Retry karein.',
        titleEn: 'Payment Failed',
        bodyEn:
          'Payment for order #{{orderNumber}} failed. Reason: {{reason}}. Please retry.',
        isActive: true,
      },

      // ─── SYSTEM: SupplierScoreUpdated → Improved ────────────────────────────
      // INV-S6-10: Only sent when |delta| >= 5 (filter in NotificationWorker, not here)
      {
        name: 'ScoreImproved_SELLER_hi',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP],
        titleHi: 'Score badh gaya!',
        bodyHi:
          'Aapka supplier score {{compositeScore}} ho gaya! Pehle {{previousCompositeScore}} tha.',
        titleEn: 'Score Improved!',
        bodyEn:
          'Your supplier score improved to {{compositeScore}} from {{previousCompositeScore}}.',
        isActive: true,
      },

      // ─── SYSTEM: SupplierScoreUpdated → Dropped ─────────────────────────────
      {
        name: 'ScoreDropped_SELLER_hi',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP],
        titleHi: 'Score gir gaya',
        bodyHi:
          'Aapka score {{previousCompositeScore}} se {{compositeScore}} ho gaya. Improvement karein!',
        titleEn: 'Score Dropped',
        bodyEn:
          'Your supplier score dropped from {{previousCompositeScore}} to {{compositeScore}}. Please improve!',
        isActive: true,
      },

      // ─── INVENTORY: StockLow ─────────────────────────────────────────────────
      // INV-S6-11: Max 1 SMS per (productId, businessId) per 24h — enforced in handler
      {
        name: 'StockLow_SELLER_hi',
        type: NotificationType.INVENTORY,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP],
        titleHi: 'Stock kam ho raha hai',
        bodyHi:
          '{{productName}} ka stock sirf {{stockQty}} reh gaya hai. Update karein.',
        titleEn: 'Low Stock Alert',
        bodyEn:
          '{{productName}} stock is down to {{stockQty}} units. Please restock.',
        isActive: true,
      },

      // ─── English fallbacks for key SMS/Email events ──────────────────────────
      {
        name: 'OrderCreated_BUYER_en',
        type: NotificationType.ORDER,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Order place ho gaya!',
        bodyHi:
          'Aapka order #{{orderNumber}} place ho gaya hai. Amount: ₹{{grandTotal}}',
        titleEn: 'Order Placed!',
        bodyEn:
          'Your order #{{orderNumber}} has been placed. Amount: ₹{{grandTotal}}',
        isActive: true,
      },
      {
        name: 'OrderShipped_BUYER_en',
        type: NotificationType.ORDER,
        channels: [NotificationChannel.SMS, NotificationChannel.IN_APP],
        titleHi: 'Order ship ho gaya!',
        bodyHi: '#{{orderNumber}} ship ho gaya! Tracking: {{trackingNumber}}',
        titleEn: 'Order Shipped!',
        bodyEn:
          '#{{orderNumber}} has been shipped! Tracking: {{trackingNumber}}',
        isActive: true,
      },
      {
        name: 'PaymentFailed_BUYER_en',
        type: NotificationType.PAYMENT,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Payment fail ho gayi',
        bodyHi: '#{{orderNumber}} ka payment fail ho gaya. Retry karein.',
        titleEn: 'Payment Failed',
        bodyEn: 'Payment for order #{{orderNumber}} failed. Please retry.',
        isActive: true,
      },

      // ─── SPRINT 7 PHASE 3: KYC Events ───────────────────────────────────────
      // KycApproved_SELLER_hi — sent when admin verifies business KYC
      {
        name: 'KycApproved_SELLER_hi',
        type: NotificationType.KYC,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'KYC verify ho gaya!',
        bodyHi:
          'Badhai ho! Aapki dukaan {{businessName}} VyaparNet par verified ho gayi hai. Ab aap orders receive kar sakte hain.',
        titleEn: 'KYC Verified!',
        bodyEn:
          'Congratulations! Your business {{businessName}} has been verified on VyaparNet. You can now receive orders.',
        isActive: true,
      },

      // KycApproved_SELLER_en — English fallback for KYC approval
      {
        name: 'KycApproved_SELLER_en',
        type: NotificationType.KYC,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'KYC verify ho gaya!',
        bodyHi:
          'Badhai ho! Aapki dukaan {{businessName}} VyaparNet par verified ho gayi hai.',
        titleEn: 'KYC Verified!',
        bodyEn:
          'Congratulations! Your business {{businessName}} has been verified on VyaparNet. You can now receive orders.',
        isActive: true,
      },

      // KycRejected_SELLER_hi — sent when admin rejects business KYC
      {
        name: 'KycRejected_SELLER_hi',
        type: NotificationType.KYC,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'KYC reject ho gaya',
        bodyHi:
          'Aapki dukaan {{businessName}} ka KYC reject ho gaya hai. Reason: {{reason}}. Kripya documents resubmit karein.',
        titleEn: 'KYC Rejected',
        bodyEn:
          'Your business {{businessName}} KYC was rejected. Reason: {{reason}}. Please resubmit your documents.',
        isActive: true,
      },

      // KycRejected_SELLER_en — English fallback for KYC rejection
      {
        name: 'KycRejected_SELLER_en',
        type: NotificationType.KYC,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'KYC reject ho gaya',
        bodyHi:
          'Aapki dukaan {{businessName}} ka KYC reject ho gaya. Reason: {{reason}}.',
        titleEn: 'KYC Rejected',
        bodyEn:
          'Your business {{businessName}} KYC was rejected. Reason: {{reason}}. Please resubmit your documents.',
        isActive: true,
      },

      // ─── SPRINT 7 PHASE 4: Product Approval Events ──────────────────────────
      // ProductApproved_SELLER_hi — sent when admin approves a product
      {
        name: 'ProductApproved_SELLER_hi',
        type: NotificationType.SYSTEM,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Product approved ho gaya!',
        bodyHi:
          'Badhai ho! Aapka product "{{productName}}" VyaparNet marketplace par live ho gaya hai.',
        titleEn: 'Product Approved!',
        bodyEn:
          'Congratulations! Your product "{{productName}}" is now live on VyaparNet marketplace.',
        isActive: true,
      },

      // ProductApproved_SELLER_en — English fallback for product approval
      {
        name: 'ProductApproved_SELLER_en',
        type: NotificationType.SYSTEM,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Product approved ho gaya!',
        bodyHi: 'Badhai ho! Aapka product "{{productName}}" live ho gaya hai.',
        titleEn: 'Product Approved!',
        bodyEn:
          'Congratulations! Your product "{{productName}}" is now live on VyaparNet marketplace.',
        isActive: true,
      },

      // ProductRejected_SELLER_hi — sent when admin rejects a product
      {
        name: 'ProductRejected_SELLER_hi',
        type: NotificationType.SYSTEM,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Product reject ho gaya',
        bodyHi:
          'Aapka product "{{productName}}" reject ho gaya hai. Reason: {{reason}}. Kripya product update karke dobara submit karein.',
        titleEn: 'Product Rejected',
        bodyEn:
          'Your product "{{productName}}" was rejected. Reason: {{reason}}. Please update your product and resubmit.',
        isActive: true,
      },

      // ProductRejected_SELLER_en — English fallback for product rejection
      {
        name: 'ProductRejected_SELLER_en',
        type: NotificationType.SYSTEM,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Product reject ho gaya',
        bodyHi:
          'Aapka product "{{productName}}" reject ho gaya. Reason: {{reason}}.',
        titleEn: 'Product Rejected',
        bodyEn:
          'Your product "{{productName}}" was rejected. Reason: {{reason}}. Please update and resubmit.',
        isActive: true,
      },

      // ─── SPRINT 7 PHASE 5: User Suspension Events ────────────────────────────
      // AccountSuspended_SELLER_hi — sent when admin suspends a user account
      {
        name: 'AccountSuspended_SELLER_hi',
        type: NotificationType.SYSTEM,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Account suspend ho gaya',
        bodyHi:
          'Aapka VyaparNet account temporary suspend ho gaya hai. Adhik jaankari ke liye support se sampark karein.',
        titleEn: 'Account Suspended',
        bodyEn:
          'Your VyaparNet account has been temporarily suspended. Please contact support for more information.',
        isActive: true,
      },

      // AccountSuspended_SELLER_en — English fallback for account suspension
      {
        name: 'AccountSuspended_SELLER_en',
        type: NotificationType.SYSTEM,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Account suspend ho gaya',
        bodyHi: 'Aapka account suspend ho gaya hai. Support se sampark karein.',
        titleEn: 'Account Suspended',
        bodyEn:
          'Your VyaparNet account has been temporarily suspended. Please contact support.',
        isActive: true,
      },

      // AccountActivated_SELLER_hi — sent when admin activates/reinstates a user account
      {
        name: 'AccountActivated_SELLER_hi',
        type: NotificationType.SYSTEM,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Account active ho gaya!',
        bodyHi:
          'Aapka VyaparNet account dobara active ho gaya hai. Aap ab marketplace use kar sakte hain.',
        titleEn: 'Account Reactivated!',
        bodyEn:
          'Your VyaparNet account has been reactivated. You can now use the marketplace again.',
        isActive: true,
      },

      // AccountActivated_SELLER_en — English fallback for account reactivation
      {
        name: 'AccountActivated_SELLER_en',
        type: NotificationType.SYSTEM,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Account active ho gaya!',
        bodyHi: 'Aapka account dobara active ho gaya hai.',
        titleEn: 'Account Reactivated!',
        bodyEn:
          'Your VyaparNet account has been reactivated. You can now use the marketplace again.',
        isActive: true,
      },

      // ─── SPRINT 7 PHASE 6: Order Lifecycle Events ────────────────────────────
      // OrderDelivered_BUYER_hi — admin marks SHIPPED → DELIVERED
      {
        name: 'OrderDelivered_BUYER_hi',
        type: NotificationType.ORDER,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.PUSH,
        ],
        titleHi: 'Order deliver ho gaya! 📦',
        bodyHi:
          'Aapka order #{{orderNumber}} deliver ho gaya hai. Please review karein.',
        titleEn: 'Order Delivered! 📦',
        bodyEn:
          'Your order #{{orderNumber}} has been delivered. Please review your purchase.',
        isActive: true,
      },

      // OrderCompleted_BUYER_hi — admin marks DELIVERED → COMPLETED
      {
        name: 'OrderCompleted_BUYER_hi',
        type: NotificationType.ORDER,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Order complete ho gaya! ✅',
        bodyHi:
          'Aapka order #{{orderNumber}} successfully complete ho gaya hai. VyaparNet use karne ke liye shukriya!',
        titleEn: 'Order Completed! ✅',
        bodyEn:
          'Your order #{{orderNumber}} has been completed. Thank you for shopping with VyaparNet!',
        isActive: true,
      },

      // OrderCancelled_BUYER_hi — admin force-cancels order
      {
        name: 'OrderCancelled_BUYER_hi',
        type: NotificationType.ORDER,
        channels: [
          NotificationChannel.SMS,
          NotificationChannel.IN_APP,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Order cancel ho gaya',
        bodyHi:
          'Aapka order #{{orderNumber}} cancel ho gaya hai. Reason: {{reason}}. Refund process ho raha hai.',
        titleEn: 'Order Cancelled',
        bodyEn:
          'Your order #{{orderNumber}} has been cancelled. Reason: {{reason}}. Refund will be processed shortly.',
        isActive: true,
      },

      // ─── SPRINT 8 ADDITIONS ──────────────────────────────────────────────────
      {
        name: 'ReturnInitiated_BUYER_hi',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        titleHi: 'Return request bheja gaya',
        bodyHi: 'Order #{{orderId}} ka return request submit ho gaya hai.',
        titleEn: 'Return Initiated',
        bodyEn:
          'Your return request for order #{{orderId}} has been submitted.',
        isActive: true,
      },
      {
        name: 'ReturnInitiated_BUYER_en',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        titleHi: 'Return request bheja gaya',
        bodyHi: 'Order #{{orderId}} ka return request submit ho gaya hai.',
        titleEn: 'Return Initiated',
        bodyEn:
          'Your return request for order #{{orderId}} has been submitted.',
        isActive: true,
      },
      {
        name: 'ReturnApproved_BUYER_hi',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        titleHi: 'Return approve ho gaya',
        bodyHi:
          'Order #{{orderId}} ka return approve ho gaya hai. Pick up jaldi hoga.',
        titleEn: 'Return Approved',
        bodyEn:
          'Your return for order #{{orderId}} has been approved. Pickup will be scheduled soon.',
        isActive: true,
      },
      {
        name: 'ReturnApproved_BUYER_en',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        titleHi: 'Return approve ho gaya',
        bodyHi:
          'Order #{{orderId}} ka return approve ho gaya hai. Pick up jaldi hoga.',
        titleEn: 'Return Approved',
        bodyEn:
          'Your return for order #{{orderId}} has been approved. Pickup will be scheduled soon.',
        isActive: true,
      },
      {
        name: 'ReturnRejected_BUYER_hi',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        titleHi: 'Return reject ho gaya',
        bodyHi: 'Aapka return request reject ho gaya hai. Reason: {{reason}}',
        titleEn: 'Return Rejected',
        bodyEn: 'Your return request has been rejected. Reason: {{reason}}',
        isActive: true,
      },
      {
        name: 'ReturnRejected_BUYER_en',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        titleHi: 'Return reject ho gaya',
        bodyHi: 'Aapka return request reject ho gaya hai. Reason: {{reason}}',
        titleEn: 'Return Rejected',
        bodyEn: 'Your return request has been rejected. Reason: {{reason}}',
        isActive: true,
      },
      {
        name: 'RefundInitiated_BUYER_hi',
        type: NotificationType.SYSTEM,
        channels: [
          NotificationChannel.IN_APP,
          NotificationChannel.SMS,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Refund process shuru',
        bodyHi: '₹{{amount}} ka refund aapke account me jaldi aayega.',
        titleEn: 'Refund Initiated',
        bodyEn:
          'A refund of ₹{{amount}} has been initiated and will reflect soon.',
        isActive: true,
      },
      {
        name: 'RefundInitiated_BUYER_en',
        type: NotificationType.SYSTEM,
        channels: [
          NotificationChannel.IN_APP,
          NotificationChannel.SMS,
          NotificationChannel.EMAIL,
        ],
        titleHi: 'Refund process shuru',
        bodyHi: '₹{{amount}} ka refund aapke account me jaldi aayega.',
        titleEn: 'Refund Initiated',
        bodyEn:
          'A refund of ₹{{amount}} has been initiated and will reflect soon.',
        isActive: true,
      },
      {
        name: 'DisputeOpened_BUYER_hi',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP],
        titleHi: 'Dispute open ho gaya',
        bodyHi:
          'Aapka dispute (ID: {{disputeId}}) open ho gaya hai aur priority: {{priority}} hai.',
        titleEn: 'Dispute Opened',
        bodyEn:
          'Your dispute (ID: {{disputeId}}) has been opened with {{priority}} priority.',
        isActive: true,
      },
      {
        name: 'DisputeOpened_BUYER_en',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP],
        titleHi: 'Dispute open ho gaya',
        bodyHi:
          'Aapka dispute (ID: {{disputeId}}) open ho gaya hai aur priority: {{priority}} hai.',
        titleEn: 'Dispute Opened',
        bodyEn:
          'Your dispute (ID: {{disputeId}}) has been opened with {{priority}} priority.',
        isActive: true,
      },
      {
        name: 'DisputeResolved_BUYER_hi',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        titleHi: 'Dispute resolve ho gaya',
        bodyHi:
          'Dispute (ID: {{disputeId}}) resolve ho gaya hai. Outcome: {{outcome}}',
        titleEn: 'Dispute Resolved',
        bodyEn:
          'Dispute (ID: {{disputeId}}) has been resolved. Outcome: {{outcome}}',
        isActive: true,
      },
      {
        name: 'DisputeResolved_BUYER_en',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        titleHi: 'Dispute resolve ho gaya',
        bodyHi:
          'Dispute (ID: {{disputeId}}) resolve ho gaya hai. Outcome: {{outcome}}',
        titleEn: 'Dispute Resolved',
        bodyEn:
          'Dispute (ID: {{disputeId}}) has been resolved. Outcome: {{outcome}}',
        isActive: true,
      },
      {
        name: 'QuoteReceived_BUYER_hi',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP],
        titleHi: 'Naya quotation aaya hai',
        bodyHi:
          'Aapko ek naya quotation (ID: {{quotationId}}) mila hai. Total Price: ₹{{totalPrice}}. Valid until: {{validUntil}}',
        titleEn: 'New Quotation Received',
        bodyEn:
          'You received a new quotation (ID: {{quotationId}}). Total Price: ₹{{totalPrice}}. Valid until: {{validUntil}}',
        isActive: true,
      },
      {
        name: 'QuoteReceived_BUYER_en',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP],
        titleHi: 'Naya quotation aaya hai',
        bodyHi:
          'Aapko ek naya quotation (ID: {{quotationId}}) mila hai. Total Price: ₹{{totalPrice}}. Valid until: {{validUntil}}',
        titleEn: 'New Quotation Received',
        bodyEn:
          'You received a new quotation (ID: {{quotationId}}). Total Price: ₹{{totalPrice}}. Valid until: {{validUntil}}',
        isActive: true,
      },
      {
        name: 'QuoteAccepted_SELLER_hi',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        titleHi: 'Quotation accept ho gaya',
        bodyHi:
          'Buyer ne aapka quotation (ID: {{quotationId}}) accept kar liya hai.',
        titleEn: 'Quotation Accepted',
        bodyEn: 'Buyer has accepted your quotation (ID: {{quotationId}}).',
        isActive: true,
      },
      {
        name: 'QuoteAccepted_SELLER_en',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP, NotificationChannel.SMS],
        titleHi: 'Quotation accept ho gaya',
        bodyHi:
          'Buyer ne aapka quotation (ID: {{quotationId}}) accept kar liya hai.',
        titleEn: 'Quotation Accepted',
        bodyEn: 'Buyer has accepted your quotation (ID: {{quotationId}}).',
        isActive: true,
      },
      {
        name: 'ReturnRaised_SELLER_hi',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP],
        titleHi: 'Return approve ho gaya',
        bodyHi: 'Buyer ne ek return approve karwaya hai (Order #{{orderId}}).',
        titleEn: 'Return Approved',
        bodyEn: 'A return has been approved for your order #{{orderId}}.',
        isActive: true,
      },
      {
        name: 'ReturnRaised_SELLER_en',
        type: NotificationType.SYSTEM,
        channels: [NotificationChannel.IN_APP],
        titleHi: 'Return approve ho gaya',
        bodyHi: 'Buyer ne ek return approve karwaya hai (Order #{{orderId}}).',
        titleEn: 'Return Approved',
        bodyEn: 'A return has been approved for your order #{{orderId}}.',
        isActive: true,
      },
    ];
  }
}
