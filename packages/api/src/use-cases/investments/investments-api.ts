/**
 * @purpose Expose investment use cases through the bubo API facade chain.
 * @role    Use-case layer wrapper over investment persistence and workflows.
 * @deps    Investments API repository.
 * @gotcha  Positions are forecasts of holdings; only materialized snapshots touch net worth.
 */

import { InvestmentsApiRepository } from "../../infrastructure/db/repositories/investments-api.repository"

export abstract class InvestmentsApi extends InvestmentsApiRepository {}
