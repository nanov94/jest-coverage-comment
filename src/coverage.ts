import * as core from '@actions/core'
import { CoverageLine, CoverageReport, Options } from './types.d'
import { getContentFile, getCoverageColor } from './utils'
import { parseCoverage, getTotalLine, isFile, isFolder } from './parse-coverage'

const DEFAULT_COVERAGE: Omit<CoverageReport, 'coverageHtml'> = {
  coverage: 0,
  color: 'red',
  branches: 0,
  functions: 0,
  lines: 0,
  statements: 0,
}

/** Convert coverage to md. */
function coverageToMarkdown(
  coverageArr: CoverageLine[],
  options: Options,
  coverageCompareArr?: CoverageLine[]
): string {
  const { reportOnlyChangedFiles, coverageTitle } = options
  const { coverage } = getCoverage(coverageArr)
  let coverageCompareFile

  if (coverageCompareArr) {
    ;({ coverage: coverageCompareFile } = getCoverage(coverageCompareArr))
  }

  const table = toTable(coverageArr, options, coverageCompareArr)
  const onlyChanged = reportOnlyChangedFiles ? '• ' : ''

  let mainCoveragePercentage = `${coverage}%`

  if (coverageCompareFile) {
    const icon = getDiffMark(coverage, coverageCompareFile)
    mainCoveragePercentage = `${icon} ${coverage}% (${coverageCompareFile}%)`
  }

  const reportHtml = `<details><summary>${coverageTitle} ${onlyChanged}(<b>${mainCoveragePercentage}</b>)</summary>${table}</details>`

  return reportHtml
}

/** Get coverage and color from CoverageLine[]. */
function getCoverage(
  coverageArr: CoverageLine[]
): Omit<CoverageReport, 'coverageHtml'> {
  const allFilesLine = getTotalLine(coverageArr)

  if (!allFilesLine) {
    return DEFAULT_COVERAGE
  }

  const { lines, branch, funcs, stmts } = allFilesLine
  const color = getCoverageColor(lines)
  const coverage = parseInt(lines.toString())
  const branches = parseInt(branch.toString())
  const functions = parseInt(funcs.toString())
  const statements = parseInt(stmts.toString())

  return {
    color,
    coverage,
    branches,
    functions,
    statements,
    lines: coverage,
  }
}

/** Make html table from coverage.txt. */
function toTable(
  coverageArr: CoverageLine[],
  options: Options,
  coverageCompareArr?: CoverageLine[]
): string {
  const headTr = toHeadRow()

  const totalRow = getTotalLine(coverageArr)
  const totalTr = toTotalRow(totalRow)

  const folders = makeFolders(coverageArr, options)
  const pathsCompare =
    coverageCompareArr && getFilesDataByFileName(coverageCompareArr)
  const { reportOnlyChangedFiles, changedFiles } = options
  const rows = [totalTr]

  for (const key of Object.keys(folders)) {
    const files = folders[key]
      .filter((line) => {
        if (!reportOnlyChangedFiles) {
          return true
        }

        return changedFiles?.all.some((c) => c.includes(line.file))
      })
      // Filter folders without files
      .filter((_line, _i, arr) => {
        if (!reportOnlyChangedFiles) {
          return true
        }

        return arr.length > 1
      })
      .map((line) => toRow(line, isFile(line), options, pathsCompare))
    rows.push(...files)
  }

  const hasLines = rows.length > 1
  const isFilesChanged =
    reportOnlyChangedFiles && !hasLines
      ? '<i>report-only-changed-files is enabled. No files were changed in this commit :)</i>'
      : ''

  // prettier-ignore
  return `<table>${headTr}<tbody>${rows.join('')}</tbody></table>${isFilesChanged}`
}

/** Make html head row - th. */
function toHeadRow(): string {
  return '<tr><th>File</th><th>% Stmts</th><th>% Branch</th><th>% Funcs</th><th>% Lines</th><th>Uncovered Line</th></tr>'
}

/** Make html row - tr. */
function toRow(
  line: CoverageLine,
  indent = false,
  options: Options,
  pathsCompare?: { [key: string]: CoverageLine }
): string {
  const { stmts, branch, funcs, lines } = line

  const fileName = toFileNameTd(line, indent, options)
  const missing = toMissingTd(line, options)

  const file = isFolder(line) ? line.file : fileName

  if (pathsCompare) {
    const lineCompare = pathsCompare[line.file]

    core.info(`Row (line.file): "${line.file}"`)
    core.info(`Row (lineCompare): "${lineCompare}"`)

    if (options.reportOnlyAffectedFiles && !isAffectedFile(line, lineCompare)) {
      return ''
    }

    const statements = getExtendedPercentage(
      lineCompare,
      stmts,
      lineCompare?.stmts
    )
    const branches = getExtendedPercentage(
      lineCompare,
      branch,
      lineCompare?.branch
    )
    const functions = getExtendedPercentage(
      lineCompare,
      funcs,
      lineCompare?.funcs
    )
    const linesData = getExtendedPercentage(
      lineCompare,
      lines,
      lineCompare?.lines
    )

    return `<tr><td>${file}</td><td>${statements}</td><td>${branches}</td><td>${functions}</td><td>${linesData}</td><td>${missing}</td></tr>`
  }

  return `<tr><td>${file}</td><td>${stmts}</td><td>${branch}</td><td>${funcs}</td><td>${lines}</td><td>${missing}</td></tr>`
}

function isAffectedFile(
  line: CoverageLine,
  lineCompare: CoverageLine
): boolean {
  const { stmts, branch, funcs, lines } = lineCompare || {}

  return (
    line.stmts !== stmts ||
    line.branch !== branch ||
    line.funcs !== funcs ||
    line.lines !== lines
  )
}

function getExtendedPercentage(
  lineCompare: CoverageLine,
  item: number,
  itemCompare?: number
): string {
  if (lineCompare) {
    return `${getDiffMark(item, itemCompare)} ${item} (${itemCompare})`
  }

  return `${getDiffMark(item)} ${item} (new)`
}

const up_icon = '&#128994;'
const down_icon = '&#128315;'
const full_icon = '&#x2705;'

function getDiffMark(first: number, second?: number): string {
  if (first === 100) {
    return full_icon
  }

  if (!second) {
    return ''
  }

  if (first > second) {
    return up_icon
  }

  if (first < second) {
    return down_icon
  }

  return ''
}

/** Make summary row - tr. */
function toTotalRow(line: CoverageLine | undefined): string {
  if (!line) {
    return '&nbsp;'
  }

  const { file, stmts, branch, funcs, lines } = line
  return `<tr><td><b>${file}</b></td><td><b>${stmts}</b></td><td><b>${branch}</b></td><td><b>${funcs}</b></td><td><b>${lines}</b></td><td>&nbsp;</td></tr>`
}

/** Make fileName cell - td. */
function toFileNameTd(
  line: CoverageLine,
  indent = false,
  options: Options
): string {
  const {
    serverUrl = 'https://github.com',
    repository,
    prefix,
    commit,
    coveragePathPrefix,
    removeLinksToFiles,
  } = options
  const relative = line.file.replace(prefix, '')
  const href = `${serverUrl}/${repository}/blob/${commit}/${coveragePathPrefix}${relative}`
  const parts = relative.split('/')
  const last = parts[parts.length - 1]
  const space = indent ? '&nbsp; &nbsp;' : ''

  return removeLinksToFiles
    ? `${space}${last}`
    : `${space}<a href="${href}">${last}</a>`
}

/** Make missing cell - td. */
function toMissingTd(line: CoverageLine, options: Options): string {
  if (!line.uncoveredLines?.length || options.removeLines) {
    return '&nbsp;'
  }

  return line.uncoveredLines
    .map((range) => {
      const {
        serverUrl = 'https://github.com',
        repository,
        commit,
        coveragePathPrefix,
        removeLinksToLines,
      } = options
      const [start, end = start] = range.split('-')
      const fragment = start === end ? `L${start}` : `L${start}-L${end}`
      const relative = line.file
      const href = `${serverUrl}/${repository}/blob/${commit}/${coveragePathPrefix}${relative}#${fragment}`
      const text = start === end ? start : `${start}&ndash;${end}`

      return removeLinksToLines ? text : `<a href="${href}">${text}</a>`
    })
    .join(', ')
}

/** Collapse all lines to folders structure. */
function makeFolders(
  coverageArr: CoverageLine[],
  options: Options
): { [key: string]: CoverageLine[] } {
  const folders: { [key: string]: CoverageLine[] } = {}

  for (const line of coverageArr) {
    if (line.file === 'All files') {
      continue
    }
    const parts = line.file.replace(options.prefix, '').split('/')
    const folder = isFile(line) ? parts.slice(0, -1).join('/') : line.file

    folders[folder] = folders[folder] || []
    folders[folder].push(line)
  }

  return folders
}

function getFilesDataByFileName(coverageArr: CoverageLine[]): {
  [key: string]: CoverageLine
} {
  const paths: { [key: string]: CoverageLine } = {}

  for (const line of coverageArr) {
    if (line.file === 'All files') {
      continue
    }

    paths[line.file] = line
  }

  return paths
}

/** Return full html coverage report and coverage percentage. */
export function getCoverageReport(options: Options): CoverageReport {
  const { coverageFile, coverageCompareFile } = options

  try {
    if (!coverageFile) {
      return { ...DEFAULT_COVERAGE, coverageHtml: '' }
    }

    const txtContent = getContentFile(coverageFile)
    const coverageArr = parseCoverage(txtContent)

    let coverageCompareArr

    if (coverageCompareFile) {
      const txtCompareContent = getContentFile(coverageCompareFile)
      const coverageLines = parseCoverage(txtCompareContent)
      coverageCompareArr = coverageLines.length ? coverageLines : undefined
    }

    if (coverageArr) {
      const coverage = getCoverage(coverageArr)
      const coverageHtml = coverageToMarkdown(
        coverageArr,
        options,
        coverageCompareArr
      )

      return { ...coverage, coverageHtml }
    }
  } catch (error) {
    if (error instanceof Error) {
      core.error(`Generating coverage report. ${error.message}`)
    }
  }

  return { ...DEFAULT_COVERAGE, coverageHtml: '' }
}
