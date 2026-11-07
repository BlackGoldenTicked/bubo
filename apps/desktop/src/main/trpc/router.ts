/**
 * @purpose Define the tRPC IPC router that exposes bubo product operations to the renderer.
 * @role    Sidecar API boundary between Tauri commands and @bubo/api services.
 * @deps    @trpc/server, @bubo/api, @bubo/db, and sidecar context.
 * @gotcha  Keep renderer-facing contracts aligned with the Tauri bridge and React callers.
 */

import { TRPCError } from "@trpc/server"
import type { BuboApi } from "@bubo/api"
import type {
  CardImageData,
  CardImageRefInput,
  CardSummary,
  ImportVoiceLlmModelsInput,
  ParseVoiceIntentInput,
  RemoveVoiceLlmModelInput,
  SaveVoiceSettingsInput,
  TranscribeVoiceInput,
  TranscribeVoiceResult,
  VoiceIntentParseResult,
  VoiceLlmPoolEntryView,
  VoiceSettingsSnapshot,
} from "@bubo/shared/contracts"
import type { Result } from "@bubo/shared"
import type { AttachCardScanInput } from "./card-service"
import { publicProcedure, router, type TrpcContext } from "./trpc"

type ApiMethod<Key extends keyof BuboApi> = BuboApi[Key] extends (...args: never[]) => unknown
  ? BuboApi[Key]
  : never
type ApiInput<Key extends keyof BuboApi> = Parameters<ApiMethod<Key>>[0]

function unwrap<T>(result: Result<T>): T {
  if (!result.success) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error })
  }
  return result.data
}

function inputOrEmpty<Key extends keyof BuboApi>(input: unknown): ApiInput<Key> {
  return (input ?? {}) as ApiInput<Key>
}

function requiredInput<Key extends keyof BuboApi>(input: unknown): NonNullable<ApiInput<Key>> {
  return input as unknown as NonNullable<ApiInput<Key>>
}

function apiInput<Key extends keyof BuboApi>() {
  return (input: unknown) => input as ApiInput<Key>
}

async function callApi<T>(
  ctx: TrpcContext,
  action: (api: BuboApi) => Promise<Result<T>>,
): Promise<T> {
  return unwrap(await action(ctx.api))
}

export const appRouter = router({
  dashboard: router({
    snapshot: publicProcedure.query(({ ctx }) => callApi(ctx, (api) => api.getDashboardSnapshot())),
  }),
  reference: router({
    categories: publicProcedure
      .input(apiInput<"listCategories">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listCategories(inputOrEmpty<"listCategories">(input))),
      ),
    createCategory: publicProcedure
      .input(apiInput<"createCategory">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.createCategory(requiredInput<"createCategory">(input))),
      ),
    updateCategory: publicProcedure
      .input(apiInput<"updateCategory">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.updateCategory(requiredInput<"updateCategory">(input))),
      ),
    archiveCategory: publicProcedure
      .input(apiInput<"archiveCategory">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.archiveCategory(requiredInput<"archiveCategory">(input))),
      ),
    currencySettings: publicProcedure.query(({ ctx }) =>
      callApi(ctx, (api) => api.getCurrencySettings()),
    ),
    exchangeRates: publicProcedure
      .input(apiInput<"listExchangeRates">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listExchangeRates(inputOrEmpty<"listExchangeRates">(input))),
      ),
    currentRates: publicProcedure.query(({ ctx }) => callApi(ctx, (api) => api.getCurrentRates())),
    updateCurrencySettings: publicProcedure
      .input(apiInput<"updateCurrencySettings">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.updateCurrencySettings(requiredInput<"updateCurrencySettings">(input)),
        ),
      ),
    refreshExchangeRates: publicProcedure
      .input(apiInput<"refreshExchangeRates">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.refreshExchangeRates(inputOrEmpty<"refreshExchangeRates">(input)),
        ),
      ),
  }),
  imports: router({
    statementImports: publicProcedure
      .input(apiInput<"listStatementImports">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.listStatementImports(inputOrEmpty<"listStatementImports">(input)),
        ),
      ),
    statementLines: publicProcedure
      .input(apiInput<"listStatementLines">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listStatementLines(inputOrEmpty<"listStatementLines">(input))),
      ),
    importedEntries: publicProcedure
      .input(apiInput<"listImportedEntries">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listImportedEntries(inputOrEmpty<"listImportedEntries">(input))),
      ),
    convertStatementLines: publicProcedure
      .input(apiInput<"convertStatementLinesToCashflowEvents">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.convertStatementLinesToCashflowEvents(
            inputOrEmpty<"convertStatementLinesToCashflowEvents">(input),
          ),
        ),
      ),
  }),
  cashflow: router({
    list: publicProcedure
      .input(apiInput<"listCashflowEvents">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listCashflowEvents(inputOrEmpty<"listCashflowEvents">(input))),
      ),
    summary: publicProcedure
      .input(apiInput<"getCashflowSummary">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.getCashflowSummary(inputOrEmpty<"getCashflowSummary">(input))),
      ),
    breakdown: publicProcedure
      .input(apiInput<"getCashflowBreakdown">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.getCashflowBreakdown(inputOrEmpty<"getCashflowBreakdown">(input)),
        ),
      ),
    monthlyTrend: publicProcedure
      .input(apiInput<"getMonthlyCashflowTrend">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.getMonthlyCashflowTrend(inputOrEmpty<"getMonthlyCashflowTrend">(input)),
        ),
      ),
    create: publicProcedure
      .input(apiInput<"createCashflowEvent">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.createCashflowEvent(requiredInput<"createCashflowEvent">(input))),
      ),
    update: publicProcedure
      .input(apiInput<"updateCashflowEvent">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.updateCashflowEvent(requiredInput<"updateCashflowEvent">(input))),
      ),
    ignore: publicProcedure
      .input(apiInput<"ignoreCashflowEvent">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.ignoreCashflowEvent(requiredInput<"ignoreCashflowEvent">(input))),
      ),
    delete: publicProcedure
      .input(apiInput<"deleteCashflowEvent">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.deleteCashflowEvent(requiredInput<"deleteCashflowEvent">(input))),
      ),
    setAnalyticsIncluded: publicProcedure
      .input(apiInput<"setCashflowEventAnalyticsIncluded">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.setCashflowEventAnalyticsIncluded(
            requiredInput<"setCashflowEventAnalyticsIncluded">(input),
          ),
        ),
      ),
    linkedTo: publicProcedure
      .input(apiInput<"listLinkedCashflowEvents">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.listLinkedCashflowEvents(requiredInput<"listLinkedCashflowEvents">(input)),
        ),
      ),
    bind: publicProcedure
      .input(apiInput<"bindCashflowEvents">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.bindCashflowEvents(requiredInput<"bindCashflowEvents">(input))),
      ),
    unbind: publicProcedure
      .input(apiInput<"unbindCashflowEvent">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.unbindCashflowEvent(requiredInput<"unbindCashflowEvent">(input))),
      ),
  }),
  assets: router({
    items: publicProcedure
      .input(apiInput<"listAssetItems">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listAssetItems(inputOrEmpty<"listAssetItems">(input))),
      ),
    snapshots: publicProcedure
      .input(apiInput<"listAssetSnapshots">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listAssetSnapshots(inputOrEmpty<"listAssetSnapshots">(input))),
      ),
    sparklines: publicProcedure
      .input(apiInput<"listAssetSparklines">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listAssetSparklines(inputOrEmpty<"listAssetSparklines">(input))),
      ),
    netWorth: publicProcedure
      .input(apiInput<"getNetWorthSnapshot">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.getNetWorthSnapshot(inputOrEmpty<"getNetWorthSnapshot">(input))),
      ),
    change: publicProcedure
      .input(apiInput<"getAssetChange">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.getAssetChange(requiredInput<"getAssetChange">(input))),
      ),
    createItem: publicProcedure
      .input(apiInput<"createAssetItem">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.createAssetItem(requiredInput<"createAssetItem">(input))),
      ),
    updateItem: publicProcedure
      .input(apiInput<"updateAssetItem">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.updateAssetItem(requiredInput<"updateAssetItem">(input))),
      ),
    archiveItem: publicProcedure
      .input(apiInput<"archiveAssetItem">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.archiveAssetItem(requiredInput<"archiveAssetItem">(input))),
      ),
    restoreItem: publicProcedure
      .input(apiInput<"restoreAssetItem">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.restoreAssetItem(requiredInput<"restoreAssetItem">(input))),
      ),
    addSnapshot: publicProcedure
      .input(apiInput<"addAssetSnapshot">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.addAssetSnapshot(requiredInput<"addAssetSnapshot">(input))),
      ),
    updateSnapshot: publicProcedure
      .input(apiInput<"updateAssetSnapshot">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.updateAssetSnapshot(requiredInput<"updateAssetSnapshot">(input))),
      ),
    deleteSnapshot: publicProcedure
      .input(apiInput<"deleteAssetSnapshot">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.deleteAssetSnapshot(requiredInput<"deleteAssetSnapshot">(input))),
      ),
  }),
  investments: router({
    positions: publicProcedure
      .input(apiInput<"listInvestmentPositions">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.listInvestmentPositions(inputOrEmpty<"listInvestmentPositions">(input)),
        ),
      ),
    position: publicProcedure
      .input(apiInput<"getInvestmentPosition">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.getInvestmentPosition(requiredInput<"getInvestmentPosition">(input)),
        ),
      ),
    createPosition: publicProcedure
      .input(apiInput<"createInvestmentPosition">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.createInvestmentPosition(requiredInput<"createInvestmentPosition">(input)),
        ),
      ),
    updatePosition: publicProcedure
      .input(apiInput<"updateInvestmentPosition">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.updateInvestmentPosition(requiredInput<"updateInvestmentPosition">(input)),
        ),
      ),
    deletePosition: publicProcedure
      .input(apiInput<"deleteInvestmentPosition">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.deleteInvestmentPosition(requiredInput<"deleteInvestmentPosition">(input)),
        ),
      ),
    addTransaction: publicProcedure
      .input(apiInput<"addInvestmentTransaction">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.addInvestmentTransaction(requiredInput<"addInvestmentTransaction">(input)),
        ),
      ),
    deleteTransaction: publicProcedure
      .input(apiInput<"deleteInvestmentTransaction">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.deleteInvestmentTransaction(requiredInput<"deleteInvestmentTransaction">(input)),
        ),
      ),
    recordQuote: publicProcedure
      .input(apiInput<"recordPriceQuote">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.recordPriceQuote(requiredInput<"recordPriceQuote">(input))),
      ),
    quotes: publicProcedure
      .input(apiInput<"listPriceQuotes">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listPriceQuotes(requiredInput<"listPriceQuotes">(input))),
      ),
  }),
  contracts: router({
    positions: publicProcedure
      .input(apiInput<"listContractPositions">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.listContractPositions(inputOrEmpty<"listContractPositions">(input)),
        ),
      ),
    createPosition: publicProcedure
      .input(apiInput<"createContractPosition">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.createContractPosition(requiredInput<"createContractPosition">(input)),
        ),
      ),
    updatePosition: publicProcedure
      .input(apiInput<"updateContractPosition">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.updateContractPosition(requiredInput<"updateContractPosition">(input)),
        ),
      ),
    closePosition: publicProcedure
      .input(apiInput<"closeContractPosition">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.closeContractPosition(requiredInput<"closeContractPosition">(input)),
        ),
      ),
    deletePosition: publicProcedure
      .input(apiInput<"deleteContractPosition">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.deleteContractPosition(requiredInput<"deleteContractPosition">(input)),
        ),
      ),
  }),
  subscriptions: router({
    list: publicProcedure
      .input(apiInput<"listSubscriptions">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listSubscriptions(inputOrEmpty<"listSubscriptions">(input))),
      ),
    occurrences: publicProcedure
      .input(apiInput<"listSubscriptionOccurrences">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.listSubscriptionOccurrences(inputOrEmpty<"listSubscriptionOccurrences">(input)),
        ),
      ),
    create: publicProcedure
      .input(apiInput<"createSubscription">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.createSubscription(requiredInput<"createSubscription">(input))),
      ),
    update: publicProcedure
      .input(apiInput<"updateSubscription">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.updateSubscription(requiredInput<"updateSubscription">(input))),
      ),
    archive: publicProcedure
      .input(apiInput<"archiveSubscription">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.archiveSubscription(requiredInput<"archiveSubscription">(input))),
      ),
  }),
  cards: router({
    list: publicProcedure
      .input(apiInput<"listCards">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listCards(inputOrEmpty<"listCards">(input))),
      ),
    get: publicProcedure
      .input(apiInput<"getCard">())
      .query(({ ctx, input }) => callApi(ctx, (api) => api.getCard(requiredInput<"getCard">(input)))),
    create: publicProcedure
      .input(apiInput<"createCard">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.createCard(requiredInput<"createCard">(input))),
      ),
    update: publicProcedure
      .input(apiInput<"updateCard">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.updateCard(requiredInput<"updateCard">(input))),
      ),
    archive: publicProcedure
      .input(apiInput<"archiveCard">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.archiveCard(requiredInput<"archiveCard">(input))),
      ),
    /** The renderer bridge opens the native picker and injects `filePath` before this runs. */
    attachImage: publicProcedure
      .input((v) => v as AttachCardScanInput)
      .mutation(
        async ({ ctx, input }): Promise<CardSummary> => unwrap(await ctx.cards.attachScan(input)),
      ),
    image: publicProcedure
      .input((v) => v as CardImageRefInput)
      .query(async ({ ctx, input }): Promise<CardImageData> => unwrap(await ctx.cards.readScan(input))),
    removeImage: publicProcedure
      .input((v) => v as CardImageRefInput)
      .mutation(
        async ({ ctx, input }): Promise<CardSummary> => unwrap(await ctx.cards.removeScan(input)),
      ),
  }),
  loans: router({
    list: publicProcedure
      .input(apiInput<"listLoans">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listLoans(inputOrEmpty<"listLoans">(input))),
      ),
    get: publicProcedure
      .input(apiInput<"getLoan">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.getLoan(requiredInput<"getLoan">(input))),
      ),
    occurrences: publicProcedure
      .input(apiInput<"listLoanPaymentOccurrences">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.listLoanPaymentOccurrences(inputOrEmpty<"listLoanPaymentOccurrences">(input)),
        ),
      ),
    futurePressure: publicProcedure
      .input(apiInput<"getFutureFixedPressure">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.getFutureFixedPressure(inputOrEmpty<"getFutureFixedPressure">(input)),
        ),
      ),
    create: publicProcedure
      .input(apiInput<"createLoan">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.createLoan(requiredInput<"createLoan">(input))),
      ),
    update: publicProcedure
      .input(apiInput<"updateLoan">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.updateLoan(requiredInput<"updateLoan">(input))),
      ),
    archive: publicProcedure
      .input(apiInput<"archiveLoan">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.archiveLoan(requiredInput<"archiveLoan">(input))),
      ),
    generateOccurrences: publicProcedure
      .input(apiInput<"generateLoanPaymentOccurrences">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.generateLoanPaymentOccurrences(
            requiredInput<"generateLoanPaymentOccurrences">(input),
          ),
        ),
      ),
  }),
  budgets: router({
    sets: publicProcedure.query(({ ctx }) => callApi(ctx, (api) => api.listBudgetSets())),
    periods: publicProcedure
      .input(apiInput<"listBudgetPeriods">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listBudgetPeriods(inputOrEmpty<"listBudgetPeriods">(input))),
      ),
    items: publicProcedure
      .input(apiInput<"listBudgetItems">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listBudgetItems(inputOrEmpty<"listBudgetItems">(input))),
      ),
    progress: publicProcedure
      .input(apiInput<"getBudgetReferenceProgress">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.getBudgetReferenceProgress(requiredInput<"getBudgetReferenceProgress">(input)),
        ),
      ),
    createSet: publicProcedure
      .input(apiInput<"createBudgetSet">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.createBudgetSet(requiredInput<"createBudgetSet">(input))),
      ),
    rolloverSuggestion: publicProcedure
      .input(apiInput<"getBudgetRolloverSuggestion">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.getBudgetRolloverSuggestion(inputOrEmpty<"getBudgetRolloverSuggestion">(input)),
        ),
      ),
    createPeriodFromLatest: publicProcedure
      .input(apiInput<"createBudgetPeriodFromLatest">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) =>
          api.createBudgetPeriodFromLatest(inputOrEmpty<"createBudgetPeriodFromLatest">(input)),
        ),
      ),
    createPeriod: publicProcedure
      .input(apiInput<"createBudgetPeriod">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.createBudgetPeriod(requiredInput<"createBudgetPeriod">(input))),
      ),
    createItem: publicProcedure
      .input(apiInput<"createBudgetItem">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.createBudgetItem(requiredInput<"createBudgetItem">(input))),
      ),
    updateItem: publicProcedure
      .input(apiInput<"updateBudgetItem">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.updateBudgetItem(requiredInput<"updateBudgetItem">(input))),
      ),
    archiveItem: publicProcedure
      .input(apiInput<"archiveBudgetItem">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.archiveBudgetItem(requiredInput<"archiveBudgetItem">(input))),
      ),
  }),
  system: router({
    resetAll: publicProcedure.mutation(({ ctx }) => callApi(ctx, (api) => api.resetAllData())),
  }),
  ledgers: router({
    list: publicProcedure.query(({ ctx }) => ctx.ledgers.list()),
    active: publicProcedure.query(({ ctx }) => ctx.ledgers.getActive()),
    create: publicProcedure
      .input((v) => v as { name: string })
      .mutation(({ ctx, input }) => ctx.ledgers.create(input.name)),
    switch: publicProcedure
      .input((v) => v as { id: string })
      .mutation(({ ctx, input }) => {
        ctx.ledgers.switchTo(input.id)
        return ctx.ledgers.getActive()
      }),
    switchToPersonal: publicProcedure.mutation(({ ctx }) => {
      ctx.ledgers.switchToPersonal()
      return ctx.ledgers.getActive()
    }),
    rename: publicProcedure
      .input((v) => v as { id: string; name: string })
      .mutation(({ ctx, input }) => {
        ctx.ledgers.rename(input.id, input.name)
        return ctx.ledgers.list()
      }),
    remove: publicProcedure
      .input((v) => v as { id: string })
      .mutation(({ ctx, input }) => {
        ctx.ledgers.remove(input.id)
        return ctx.ledgers.list()
      }),
    setDemo: publicProcedure
      .input((v) => v as { id: string; isDemo: boolean })
      .mutation(({ ctx, input }) => {
        ctx.ledgers.setDemo(input.id, input.isDemo)
        return ctx.ledgers.list()
      }),
    importFromFile: publicProcedure.mutation(({ ctx }) => ctx.ledgers.importFromFile()),
    reveal: publicProcedure
      .input((v) => v as { id: string })
      .mutation(({ ctx, input }) => {
        ctx.ledgers.revealInFinder(input.id)
        return null
      }),
  }),
  links: router({
    list: publicProcedure
      .input(apiInput<"listObjectLinks">())
      .query(({ ctx, input }) =>
        callApi(ctx, (api) => api.listObjectLinks(inputOrEmpty<"listObjectLinks">(input))),
      ),
    create: publicProcedure
      .input(apiInput<"createObjectLink">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.createObjectLink(requiredInput<"createObjectLink">(input))),
      ),
    confirm: publicProcedure
      .input(apiInput<"confirmObjectLink">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.confirmObjectLink(requiredInput<"confirmObjectLink">(input))),
      ),
    remove: publicProcedure
      .input(apiInput<"removeObjectLink">())
      .mutation(({ ctx, input }) =>
        callApi(ctx, (api) => api.removeObjectLink(requiredInput<"removeObjectLink">(input))),
      ),
  }),
  voice: router({
    settings: publicProcedure.query(({ ctx }): VoiceSettingsSnapshot => ctx.voice.getSettings()),
    saveSettings: publicProcedure
      .input((v) => v as SaveVoiceSettingsInput)
      .mutation(
        ({ ctx, input }): VoiceSettingsSnapshot => unwrap(ctx.voice.saveSettings(input ?? {})),
      ),
    parseIntent: publicProcedure
      .input((v) => v as ParseVoiceIntentInput)
      .mutation(
        async ({ ctx, input }): Promise<VoiceIntentParseResult> =>
          unwrap(await ctx.voice.parseIntent(input)),
      ),
    transcribe: publicProcedure
      .input((v) => v as TranscribeVoiceInput)
      .mutation(
        async ({ ctx, input }): Promise<TranscribeVoiceResult> =>
          unwrap(await ctx.voice.transcribeEntry(input)),
      ),
    models: router({
      list: publicProcedure.query(({ ctx }): VoiceLlmPoolEntryView[] => ctx.voice.listLlmModels()),
      import: publicProcedure
        .input((v) => v as ImportVoiceLlmModelsInput)
        .mutation(({ ctx, input }): VoiceLlmPoolEntryView[] =>
          unwrap(ctx.voice.importLlmModels(input ?? { filePath: "" })),
        ),
      remove: publicProcedure
        .input((v) => v as RemoveVoiceLlmModelInput)
        .mutation(({ ctx, input }): VoiceLlmPoolEntryView[] =>
          unwrap(ctx.voice.removeLlmModel(input ?? { model: "" })),
        ),
    }),
  }),
})

export type AppRouter = typeof appRouter
