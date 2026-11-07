/**
 * @purpose Expose payment-card use cases through the bubo API facade chain.
 * @role    Use-case layer wrapper over card persistence.
 * @deps    Cards API repository.
 * @gotcha  Cards carry identity only. Never derive balances or net worth from them.
 */

import { CardsApiRepository } from "../../infrastructure/db/repositories/cards-api.repository"

export abstract class CardsApi extends CardsApiRepository {}
