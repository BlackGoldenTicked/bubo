/**
 * @purpose Implement contract-position operations for the layered API facade.
 * @role    Infrastructure repository layer module used by use-case wrappers.
 * @deps    /db schema, contract domain rules, row mappers, and shared API helpers.
 * @gotcha  Contract P&L is derived display math: rows never materialize into asset snapshots or cashflow.
 */

import type { ContractPositionInsert, ContractPositionRow } from "@bubo/db"
import type { Result } from "@bubo/shared"
import type {
  BuboId,
  CloseContractPositionInput,
  ContractPositionSummary,
  CreateContractPositionInput,
  DeleteContractPositionInput,
  ListContractPositionsInput,
  UpdateContractPositionInput,
} from "../../../index"
import {
  isContractMarginMode,
  isContractSide,
  normalizeLeverageBps,
  parseContractPrice,
  parseContractQuantity,
  parseOptionalAmount,
} from "../../../domain/investments/contract-rules"
import { mapContractPosition } from "../../../presentation/mappers/sqlite-row-mappers"
import {
  fail,
  formatMoney,
  formatQuantity,
  newId,
  normalizeCurrency,
  nowIso,
  ok,
} from "../../../shared/api-helpers"
import { createContractsRepository } from "./contracts.repository"
import { InvestmentsApiRepository } from "./investments-api.repository"

export abstract class ContractsApiRepository extends InvestmentsApiRepository {
  protected contractsRepository(): ReturnType<typeof createContractsRepository> {
    return createContractsRepository(this.db)
  }

  async listContractPositions(
    input: ListContractPositionsInput = {},
  ): Promise<Result<ContractPositionSummary[]>> {
    try {
      return ok(this.contractsRepository().listPositions(input).map(mapContractPosition))
    } catch (error) {
      return fail(error)
    }
  }

  async createContractPosition(
    input: CreateContractPositionInput,
  ): Promise<Result<ContractPositionSummary>> {
    try {
      const symbol = input.symbol.trim().toUpperCase()
      if (symbol === "") throw new Error("symbol is required")
      if (!isContractSide(input.side)) throw new Error("unknown contract side")
      const marginMode = input.marginMode ?? "isolated"
      if (!isContractMarginMode(marginMode)) throw new Error("unknown margin mode")
      const leverageBps = normalizeLeverageBps(input.leverageBps)
      const quantity = parseContractQuantity(input.quantity)
      const entryPrice = parseContractPrice(input.entryPrice, "entryPrice")
      const markPrice = parseContractPrice(input.markPrice, "markPrice", { optional: true })
      const liquidationPrice = parseContractPrice(input.liquidationPrice, "liquidationPrice", {
        optional: true,
      })
      const marginAmount = parseOptionalAmount(input.marginAmount, "marginAmount")
      const timestamp = nowIso()
      const id = newId("ctr")
      this.contractsRepository().insertPosition({
        id,
        symbol,
        side: input.side,
        marginMode,
        leverageBps,
        quantity: formatQuantity(quantity),
        entryPrice: formatMoney(entryPrice),
        markPrice: markPrice != null ? formatMoney(markPrice) : null,
        exitPrice: null,
        liquidationPrice: liquidationPrice != null ? formatMoney(liquidationPrice) : null,
        marginAmount: marginAmount != null ? formatMoney(marginAmount) : null,
        currency: normalizeCurrency(input.currency ?? "USD"),
        status: "open",
        openedAt: input.openedAt?.trim() || timestamp,
        closedAt: null,
        note: input.note ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      return ok(this.contractSummary(id))
    } catch (error) {
      return fail(error)
    }
  }

  async updateContractPosition(
    input: UpdateContractPositionInput,
  ): Promise<Result<ContractPositionSummary>> {
    try {
      const repository = this.contractsRepository()
      const existing = repository.getPosition(input.id)
      if (existing == null) throw new Error("contract position was not found")
      const set: Partial<ContractPositionInsert> = { updatedAt: nowIso() }
      if (input.symbol !== undefined) {
        const symbol = input.symbol.trim().toUpperCase()
        if (symbol === "") throw new Error("symbol is required")
        set.symbol = symbol
      }
      if (input.markPrice !== undefined) {
        const markPrice = parseContractPrice(input.markPrice, "markPrice", { optional: true })
        set.markPrice = markPrice != null ? formatMoney(markPrice) : null
      }
      if (input.liquidationPrice !== undefined) {
        const liquidationPrice = parseContractPrice(input.liquidationPrice, "liquidationPrice", {
          optional: true,
        })
        set.liquidationPrice = liquidationPrice != null ? formatMoney(liquidationPrice) : null
      }
      if (input.marginAmount !== undefined) {
        const marginAmount = parseOptionalAmount(input.marginAmount, "marginAmount")
        set.marginAmount = marginAmount != null ? formatMoney(marginAmount) : null
      }
      if (input.note !== undefined) set.note = input.note
      repository.updatePosition(input.id, set)
      return ok(this.contractSummary(input.id))
    } catch (error) {
      return fail(error)
    }
  }

  async closeContractPosition(
    input: CloseContractPositionInput,
  ): Promise<Result<ContractPositionSummary>> {
    try {
      const repository = this.contractsRepository()
      const existing = repository.getPosition(input.id)
      if (existing == null) throw new Error("contract position was not found")
      if (existing.status !== "open") throw new Error("contract position is already closed")
      const outcome = input.outcome ?? "closed"
      if (outcome !== "closed" && outcome !== "liquidated") {
        throw new Error("unknown close outcome")
      }
      // A normal close needs its fill price; a liquidation may record the final mark if known.
      const requiresExit = outcome === "closed"
      const exitPrice = parseContractPrice(input.exitPrice, "exitPrice", {
        optional: !requiresExit,
      })
      const timestamp = nowIso()
      repository.updatePosition(input.id, {
        status: outcome,
        exitPrice: exitPrice != null ? formatMoney(exitPrice) : null,
        closedAt: input.closedAt?.trim() || timestamp,
        updatedAt: timestamp,
      })
      return ok(this.contractSummary(input.id))
    } catch (error) {
      return fail(error)
    }
  }

  async deleteContractPosition(input: DeleteContractPositionInput): Promise<Result<void>> {
    try {
      const repository = this.contractsRepository()
      const existing = repository.getPosition(input.id)
      if (existing == null) throw new Error("contract position was not found")
      repository.deletePosition(input.id)
      return ok(undefined)
    } catch (error) {
      return fail(error)
    }
  }

  private contractSummary(id: BuboId): ContractPositionSummary {
    const row: ContractPositionRow | undefined = this.contractsRepository().getPosition(id)
    if (row == null) throw new Error("contract position was not found")
    return mapContractPosition(row)
  }
}
