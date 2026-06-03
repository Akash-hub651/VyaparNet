import { Injectable } from '@nestjs/common';
import { BuyerLedgerRepository } from '../../trust-safety/refunds/buyer-ledger.repository';

@Injectable()
export class BuyerLedgerService {
  constructor(private readonly ledgerRepo: BuyerLedgerRepository) {}

  /**
   * Retrieves paginated ledger entries for the buyer.
   */
  async getLedger(buyerId: string, page: number, limit: number, segment?: any): Promise<any> {
    return this.ledgerRepo.findManyForBuyer(buyerId, { page, limit, segment });
  }
}
