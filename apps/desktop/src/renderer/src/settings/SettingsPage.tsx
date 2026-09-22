/**
 * @purpose Render and manage the settings page workflow.
 * @role    Renderer feature surface for app configuration and reference data.
 * @deps    React, tRPC settings/reference queries, and local UI components.
 * @gotcha  Settings changes can affect user data paths and categories; keep destructive actions explicit.
 */

import { useEffect, useState } from "react"
import { useAtom } from "jotai"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { ScrollArea } from "../components/ui/ScrollArea"
import { CurrencySelect } from "../components/ui/CurrencySelect"
import { LedgerSection } from "./LedgerSection"
import { LinkRow, Row, SettingsGroup, Toggle } from "./components"
import { trpc } from "@/lib/trpc"
import { usePagePerf } from "@/lib/debug/perf"
import { amountsHiddenAtom } from "@/lib/state/uiAtoms"
import { installAvailableUpdate } from "@/lib/appUpdate"

type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "installing" | "error"

export function SettingsPage() {
  const navigate = useNavigate()
  const [hide, setHide] = useAtom(amountsHiddenAtom)
  const queryClient = useQueryClient()
  const categoriesQuery = useQuery(trpc.reference.categories.queryOptions())
  const currencyQuery = useQuery(trpc.reference.currencySettings.queryOptions())
  const ratesQuery = useQuery(trpc.reference.currentRates.queryOptions())
  usePagePerf("settings", [
    { name: "reference.categories", query: categoriesQuery },
    { name: "reference.currencySettings", query: currencyQuery },
    { name: "reference.currentRates", query: ratesQuery },
  ])
  const categories = categoriesQuery.data ?? []
  const displayCurrency = currencyQuery.data?.displayCurrency ?? "CNY"

  async function invalidateCurrencyViews() {
    await queryClient.invalidateQueries(trpc.reference.currencySettings.queryFilter())
    await queryClient.invalidateQueries(trpc.reference.currentRates.queryFilter())
    await queryClient.invalidateQueries(trpc.assets.netWorth.queryFilter())
    await queryClient.invalidateQueries(trpc.loans.futurePressure.queryFilter())
  }
  const refreshRates = useMutation(
    trpc.reference.refreshExchangeRates.mutationOptions({
      onSuccess: () => void invalidateCurrencyViews(),
    }),
  )
  const updateCurrency = useMutation(
    trpc.reference.updateCurrencySettings.mutationOptions({
      onSuccess: async () => {
        // A new base currency needs rates for that base, then a re-convert of every total.
        await refreshRates.mutateAsync({ force: true }).catch(() => {})
        await invalidateCurrencyViews()
      },
    }),
  )
  const asOf = ratesQuery.data?.asOf
  const ratesUpdatedLabel = asOf ? new Date(asOf).toLocaleString("zh-CN") : "尚未更新"

  const [appVersion, setAppVersion] = useState("")
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle")
  const [availableVersion, setAvailableVersion] = useState<string | null>(null)
  const [updateProgress, setUpdateProgress] = useState<number | null>(null)
  useEffect(() => {
    void window.bubo.getAppVersion().then(setAppVersion)
  }, [])

  async function handleUpdateAction() {
    if (updateStatus === "checking" || updateStatus === "installing") return

    if (updateStatus === "available" && availableVersion) {
      setUpdateStatus("installing")
      try {
        await installAvailableUpdate(availableVersion, setUpdateProgress)
      } catch {
        setUpdateStatus("error")
      }
      return
    }

    setUpdateStatus("checking")
    setAvailableVersion(null)
    setUpdateProgress(null)
    try {
      const update = await window.bubo.checkForUpdate()
      setAvailableVersion(update?.version ?? null)
      setUpdateStatus(update ? "available" : "up-to-date")
    } catch {
      setUpdateStatus("error")
    }
  }

  const updateLabel =
    updateStatus === "available" && availableVersion
      ? `安装 v${availableVersion}`
      : updateStatus === "installing"
        ? "正在安装更新…"
        : "检查更新"
  const updateNote =
    updateStatus === "checking"
      ? "正在检查…"
      : updateStatus === "up-to-date"
        ? "已是最新版本"
        : updateStatus === "available"
          ? "下载、安装并重启"
          : updateStatus === "installing"
            ? updateProgress == null
              ? "正在下载…"
              : `${updateProgress}%`
            : updateStatus === "error"
              ? "检查或安装失败，可重试"
              : "从 GitHub Releases 获取"
  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Fixed header */}
      <div className="shrink-0 border-b border-[var(--hair-2)] px-8 pt-7 pb-5">
        <div className="mx-auto w-[540px]">
          <div className="mb-1 font-['IBM_Plex_Mono'] text-[26px] font-semibold tracking-[-0.02em] text-[var(--ink)]">
            设置
          </div>
          <div className="text-[12.5px] text-[var(--ink-4)]">bubo · 个人版 · 数据全部存在本机</div>
        </div>
      </div>

      {/* Scrollable content */}
      <ScrollArea className="h-full flex-1 min-h-0">
        <div className="mx-auto w-[540px] pb-[60px]">
          {/* 显示偏好 */}
          <SettingsGroup title="显示偏好">
            <Row first label="主显示货币" sub="所有资产、净资产汇总以此折算">
              <div className="w-[168px]">
                <CurrencySelect
                  value={displayCurrency}
                  onChange={(code) => updateCurrency.mutate({ displayCurrency: code })}
                  isDisabled={updateCurrency.isPending}
                />
              </div>
            </Row>
            <LinkRow
              note={`上次更新 ${ratesUpdatedLabel}`}
              onClick={() => refreshRates.mutate({ force: true })}
            >
              {refreshRates.isPending ? "刷新汇率中…" : "刷新汇率"}
            </LinkRow>
            <Row label="隐藏金额" sub="演示或截图时把数字打码为 ⋯⋯">
              <Toggle on={hide} onChange={setHide} ariaLabel="隐藏金额" />
            </Row>
          </SettingsGroup>

          {/* 分类 */}
          <SettingsGroup title="分类">
            <LinkRow
              note={`${categories.length} 个`}
              onClick={() => void navigate({ to: "/settings-categories" })}
            >
              分类管理
            </LinkRow>
          </SettingsGroup>

          {/* 账本 */}
          <LedgerSection />

          {/* 关于 */}
          <SettingsGroup title="关于">
            <Row first label="版本">
              <span className="whitespace-nowrap font-['IBM_Plex_Mono'] text-[12.5px] text-[var(--ink-4)]">
                {appVersion ? `v${appVersion}` : "—"}
              </span>
            </Row>
            <LinkRow note={updateNote} onClick={() => void handleUpdateAction()}>
              {updateLabel}
            </LinkRow>
            <LinkRow
              note="自动更新不可用时使用"
              onClick={() => void window.bubo.openDownloadPage()}
            >
              手动下载最新版
            </LinkRow>
          </SettingsGroup>

          {/* Footer */}
          <div className="mt-[26px] border-t border-[var(--hair-2)] pt-[18px] text-[11px] leading-[1.6] text-[var(--ink-4)]">
            bubo 不联网、不上传，所有账单与余额仅保存在这台设备。卸载或清除数据后无法恢复。
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
