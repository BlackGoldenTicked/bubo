/**
 * @purpose Encapsulate SQLite persistence for leveraged contract positions.
 * @role    Infrastructure repository used by the contracts API facade.
 * @deps    @bubo/db schema and Drizzle query builder.
 * @gotcha  Rows store user input only; contract P&L is always derived, never persisted.
 */

import { and, asc, eq, sql, type SQL } from "drizzle-orm"
import {
  contractPositions,
  type ContractPositionInsert,
  type ContractPositionRow,
  type Database,
} from "@bubo/db"
import type { BuboId, ListContractPositionsInput } from "@bubo/shared/contracts"
import { toSqlId } from "../../../shared/api-helpers"

export function createContractsRepository(db: Database) {
  return {
    listPositions(input: ListContractPositionsInput = {}): ContractPositionRow[] {
      const conds: SQL[] = []
      if (input.status) conds.push(eq(contractPositions.status, input.status))
      return db
        .select()
        .from(contractPositions)
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(
          sql`case when ${contractPositions.status} = 'open' then 0 else 1 end`,
          asc(contractPositions.symbol),
          asc(contractPositions.createdAt),
        )
        .all()
    },

    getPosition(id: BuboId): ContractPositionRow | undefined {
      return db
        .select()
        .from(contractPositions)
        .where(eq(contractPositions.id, toSqlId(id)))
        .get()
    },

    insertPosition(values: ContractPositionInsert): void {
      db.insert(contractPositions).values(values).run()
    },

    updatePosition(id: BuboId, values: Partial<ContractPositionInsert>): void {
      db.update(contractPositions)
        .set(values)
        .where(eq(contractPositions.id, toSqlId(id)))
        .run()
    },

    deletePosition(id: BuboId): void {
      db.delete(contractPositions)
        .where(eq(contractPositions.id, toSqlId(id)))
        .run()
    },
  }
}
