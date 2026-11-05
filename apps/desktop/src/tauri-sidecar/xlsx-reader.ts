/**
 * @purpose Read the first worksheet of a local .xlsx workbook without third-party dependencies.
 * @role    Sidecar utility behind the LLM model pool Excel import.
 * @deps    Node zlib (raw deflate) and plain regex XML slicing of the OOXML sheet format.
 * @gotcha  Deliberately minimal: supports the shapes a hand-made sheet produces (shared strings,
 *          inline strings, numbers); encrypted or exotic workbooks fail with a clear error instead
 *          of half-parsed rows.
 */

import { inflateRawSync } from "node:zlib"

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  localHeaderOffset: number
}

function findEocd(data: Buffer): number {
  for (let offset = data.length - 22; offset >= 0 && offset > data.length - 66_000; offset -= 1) {
    if (data.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  throw new Error("不是有效的 xlsx 文件（找不到 zip 目录）")
}

function readCentralDirectory(data: Buffer): Map<string, ZipEntry> {
  const eocd = findEocd(data)
  const count = data.readUInt16LE(eocd + 10)
  let offset = data.readUInt32LE(eocd + 16)
  const entries = new Map<string, ZipEntry>()

  for (let index = 0; index < count; index += 1) {
    if (data.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new Error("不是有效的 xlsx 文件（zip 目录损坏）")
    }
    const method = data.readUInt16LE(offset + 10)
    const compressedSize = data.readUInt32LE(offset + 20)
    const nameLength = data.readUInt16LE(offset + 28)
    const extraLength = data.readUInt16LE(offset + 30)
    const commentLength = data.readUInt16LE(offset + 32)
    const localHeaderOffset = data.readUInt32LE(offset + 42)
    const name = data.subarray(offset + 46, offset + 46 + nameLength).toString("utf8")
    entries.set(name, { name, method, compressedSize, localHeaderOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function decompressEntry(data: Buffer, entry: ZipEntry): Buffer {
  const localHeaderOffset = entry.localHeaderOffset
  if (data.readUInt32LE(localHeaderOffset) !== LOCAL_SIGNATURE) {
    throw new Error("不是有效的 xlsx 文件（本地文件头损坏）")
  }
  const nameLength = data.readUInt16LE(localHeaderOffset + 26)
  const extraLength = data.readUInt16LE(localHeaderOffset + 28)
  const start = localHeaderOffset + 30 + nameLength + extraLength
  const raw = data.subarray(start, start + entry.compressedSize)

  if (entry.method === 0) return Buffer.from(raw)
  if (entry.method === 8) {
    try {
      return inflateRawSync(raw)
    } catch {
      throw new Error("xlsx 内容解压失败，文件可能已损坏")
    }
  }
  throw new Error("不支持的 xlsx 压缩方式")
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  const strings: string[] = []
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  for (const match of xml.matchAll(itemPattern)) {
    const text = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((part) => part[1])
      .join("")
    strings.push(decodeXmlEntities(text))
  }
  return strings
}

function columnIndex(reference: string | undefined, fallback: number): number {
  if (!reference) return fallback
  const letters = /^[A-Z]+/.exec(reference.toUpperCase())
  if (!letters) return fallback
  let index = 0
  for (const char of letters[0]) index = index * 26 + (char.charCodeAt(0) - 64)
  return index - 1
}

function parseSheetRows(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = []
  const rowPattern = /<row\b[^>]*?>([\s\S]*?)<\/row>/g
  const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g

  for (const rowMatch of xml.matchAll(rowPattern)) {
    const cells: string[] = []
    let fallbackIndex = 0
    for (const cellMatch of rowMatch[1].matchAll(cellPattern)) {
      const attrs = cellMatch[1]
      const body = cellMatch[2] ?? ""
      const reference = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const type = /\bt="(\w+)"/.exec(attrs)?.[1]
      const index = columnIndex(reference, fallbackIndex)
      fallbackIndex = index + 1

      let value = ""
      const rawValue = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1]
      if (type === "s" && rawValue != null) {
        value = sharedStrings[Number(rawValue)] ?? ""
      } else if (type === "inlineStr") {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")
      } else if (rawValue != null) {
        value = rawValue.trim()
      }
      while (cells.length < index) cells.push("")
      cells[index] = decodeXmlEntities(value).trim()
    }
    rows.push(cells)
  }
  return rows
}

/** Return every non-empty row of the first worksheet as trimmed string cells. */
export function readFirstSheetRows(data: Buffer): string[][] {
  const entries = readCentralDirectory(data)
  const sheetNames = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const sheetName = sheetNames[0]
  if (!sheetName) throw new Error("xlsx 中没有工作表")

  const sharedStringsEntry = entries.get("xl/sharedStrings.xml")
  const sharedStrings = parseSharedStrings(
    sharedStringsEntry ? decompressEntry(data, sharedStringsEntry).toString("utf8") : undefined,
  )
  const sheetXml = decompressEntry(data, entries.get(sheetName)!).toString("utf8")
  const rows = parseSheetRows(sheetXml, sharedStrings)
  return rows.filter((row) => row.some((cell) => cell.length > 0))
}
