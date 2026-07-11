import * as XLSX from 'xlsx'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function readWorkbookFromBytes(bytes, filename = '') {
  const isCsv = filename.toLowerCase().endsWith('.csv')
  if (isCsv) {
    const text = new TextDecoder('utf-8').decode(bytes)
    return XLSX.read(text, { type: 'string' })
  }
  return XLSX.read(bytes, { type: 'array' })
}

export function workbookToRows(workbook, sheetName = workbook.SheetNames[0], options = {}) {
  const worksheet = workbook.Sheets[sheetName]
  if (!worksheet) return []
  return XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: options.raw ?? false,
  })
}

const ALIAS_MAP = {
  event: ['比赛项目', '参赛项目', '项目', '比赛组别', '组别', 'event', 'category', 'race_category', '报名项目', '赛事项目'],
  source: ['报名来源', '来源', '报名渠道', '渠道', 'source', 'channel', '报名平台', '平台'],
  orderGroupId: ['订单组编号', '订单编号', '订单号', '组编号', 'order_id', 'order_group', '报名编号'],
  paymentStatus: ['支付状态', '付款状态', '支付', '付款', 'payment_status', 'payment', '缴费状态'],
  name: ['姓名', '选手姓名', '运动员姓名', '参赛者姓名', 'name', 'runner_name', 'athlete_name', '真实姓名', '报名姓名'],
  namePinyin: ['姓名全拼', '拼音', '全拼', 'pinyin', 'name_pinyin', '姓名拼音', '英文名'],
  phone: ['手机号码', '手机号', '电话', '联系电话', '手机', '移动电话', 'phone', 'mobile', 'tel', '联系方式'],
  country: ['国家/地区', '国家', '地区', '国籍', 'country', 'region', 'nationality', '国家地区'],
  idType: ['证件类型', '证件种类', 'id_type', 'document_type', '证件'],
  idNumber: ['证件号码', '身份证号', '身份证', '证件号', 'id_card', 'id_number', 'identity', '身份证号码'],
  gender: ['性别', 'gender', 'sex', '选手性别'],
  age: ['年龄', 'age', '周岁'],
  birthday: ['出生日期', '出生年月', '生日', 'birthday', 'birth_date', 'date_of_birth', '出生年月日'],
  bloodType: ['血型', 'blood_type', 'blood'],
  clothingSize: ['衣服尺码', '尺码', '服装尺码', 'size', 'clothing_size', 'shirt_size', 'T恤尺码'],
  email: ['电子邮箱', '邮箱', '邮件', 'email', 'e-mail', '电子邮件'],
  address: ['居住地详细地址', '详细地址', '地址', '家庭地址', 'address', '通讯地址', '居住地址'],
  emergencyName: ['紧急联系人姓名', '紧急联系人', '紧急联系人名字', 'emergency_contact', '紧急联系'],
  emergencyPhone: ['紧急联系人电话', '紧急联系电话', '紧急电话', 'emergency_phone', '紧急联系人手机'],
  province: ['居住地（省）', '省', '省份', 'province', '所在省'],
  city: ['居住地（市）', '市', '城市', 'city', '所在市'],
  district: ['居住地（区）', '区', '区县', 'district', '所在区'],
}

function excelDateToString(value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string') {
    const dateMatch = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (dateMatch) {
      return `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`
    }
    const num = Number(value)
    if (!isNaN(num) && num > 1 && num < 100000) {
      return excelDateToString(num)
    }
    return value
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof value === 'number' && value > 1 && value < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    const date = new Date(excelEpoch.getTime() + value * 86400000)
    const y = date.getUTCFullYear()
    const m = String(date.getUTCMonth() + 1).padStart(2, '0')
    const d = String(date.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(value)
}

function suggestMapping(columnName, standardFields, savedMappings) {
  const dynamicAliases = {}

  for (const key in ALIAS_MAP) {
    dynamicAliases[key] = [...ALIAS_MAP[key]]
  }

  if (savedMappings) {
    for (const [source, targetId] of Object.entries(savedMappings)) {
      if (!dynamicAliases[targetId]) {
        dynamicAliases[targetId] = []
      }
      if (!dynamicAliases[targetId].includes(source)) {
        dynamicAliases[targetId].push(source)
      }
    }
  }

  const normalized = columnName.trim().toLowerCase()

  for (const field of standardFields) {
    if (field.name === columnName.trim()) return field.id

    const aliases = dynamicAliases[field.id]
    if (aliases) {
      for (const alias of aliases) {
        if (alias.toLowerCase() === normalized) return field.id
      }
    }
  }

  for (const field of standardFields) {
    if (normalized.includes(field.name) || field.name.includes(columnName.trim())) {
      return field.id
    }
    const aliases = dynamicAliases[field.id]
    if (aliases) {
      for (const alias of aliases) {
        if (normalized.includes(alias.toLowerCase()) || alias.toLowerCase().includes(normalized)) {
          return field.id
        }
      }
    }
  }
  return null
}

const KNOWN_PLATFORMS = [
  '数字心动', '我要赛', '赛会通', '最酷', '马拉马拉',
  '润赛美佳', '跑跑网', '之华安方', '马拉松报名网', '云动重庆', '赛客',
]

function extractPlatform(filename) {
  const nameWithoutExt = filename.replace(/\.[^.]+$/, '')
  for (const platform of KNOWN_PLATFORMS) {
    if (nameWithoutExt.includes(platform)) return platform
  }
  return ''
}

function extractEventFromSheet(sheetName) {
  const ignoredNames = ['sheet1', 'sheet2', 'sheet3', '数据', 'data', '报名', '报名数据', '报名列表', '汇总']
  if (ignoredNames.includes(sheetName.toLowerCase().trim())) return ''
  return sheetName.trim()
}

export async function parseFile(file, standardFields, savedMappings) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const isCsv = file.name.toLowerCase().endsWith('.csv')
        const workbook = readWorkbookFromBytes(data, file.name)
        const originalFileName = file.name.replace(/\.[^.]+$/, '')
        const extractedSource = extractPlatform(file.name)

        const results = []

        for (const sheetName of workbook.SheetNames) {
          const jsonData = workbookToRows(workbook, sheetName, { raw: !isCsv })

          if (jsonData.length === 0) continue

          const headers = Object.keys(jsonData[0])
          const birthdayHeaders = new Set()
          for (const header of headers) {
            const mapped = suggestMapping(header, standardFields, savedMappings)
            if (mapped === 'birthday') birthdayHeaders.add(header)
          }

          const fullData = jsonData.map(row => {
            const r = {}
            for (const key of headers) {
              if (birthdayHeaders.has(key)) {
                r[key] = excelDateToString(row[key])
              } else {
                r[key] = String(row[key] ?? '')
              }
            }
            return r
          })

          const previewData = fullData.slice(0, 5)
          const extractedEvent = extractEventFromSheet(sheetName)

          const usedFieldIds = new Set()
          const mappings = headers.map(header => {
            const suggested = suggestMapping(header, standardFields, savedMappings)
            if (suggested && !usedFieldIds.has(suggested)) {
              usedFieldIds.add(suggested)
              return { sourceColumn: header, targetFieldId: suggested }
            }
            return { sourceColumn: header, targetFieldId: null }
          })

          const displayName = workbook.SheetNames.length > 1
            ? `${file.name} [${sheetName}]`
            : file.name

          results.push({
            id: generateId(),
            name: displayName,
            originalFileName,
            sheetName,
            extractedSource,
            extractedEvent,
            eventPriority: extractedEvent ? 'extracted' : 'mapped',
            headers,
            previewData,
            fullData,
            totalRows: jsonData.length,
            mappings,
          })
        }

        if (results.length === 0) {
          reject(new Error(`文件 "${file.name}" 中没有找到任何包含数据的工作表`))
          return
        }

        resolve(results)
      } catch (err) {
        reject(new Error(`解析文件 "${file.name}" 失败: ${err.message}`))
      }
    }
    reader.onerror = () => reject(new Error(`读取文件 "${file.name}" 失败`))
    reader.readAsArrayBuffer(file)
  })
}

export function applyMappings(rows, mappings, sourceName, standardFields, extractedSource = '', extractedEvent = '', eventPriority = 'mapped') {
  const activeMappings = mappings.filter(m => m.targetFieldId !== null)
  const hasEventMapping = activeMappings.some(m => m.targetFieldId === 'event')
  return rows.map(row => {
    const mergedRow = { _source: sourceName }
    for (const field of standardFields) {
      mergedRow[field.id] = ''
    }
    for (const mapping of activeMappings) {
      if (mapping.targetFieldId) {
        if (mapping.targetFieldId === 'event' && eventPriority === 'extracted' && extractedEvent) {
          continue
        }
        mergedRow[mapping.targetFieldId] = row[mapping.sourceColumn] ?? ''
      }
    }
    if (extractedSource && !mergedRow.source) {
      mergedRow.source = extractedSource
    }
    if (extractedEvent && (eventPriority === 'extracted' || !hasEventMapping)) {
      mergedRow.event = extractedEvent
    }
    return mergedRow
  })
}

export function exportToExcel(mergedData, standardFields, filename = '马拉松报名数据汇总.xlsx', allColumns, columnLabels) {
  const exportData = mergedData.map((row, index) => {
    const rowData = row
    const exportRow = {}
    exportRow.序号 = String(index + 1)

    if (allColumns && columnLabels) {
      for (const col of allColumns) {
        const label = columnLabels[col] || col
        switch (col) {
          case 'personalBestFullTime':
            exportRow[label] = rowData.personalBestFull?.netTime || ''
            break
          case 'personalBestFullRace':
            exportRow[label] = rowData.personalBestFull?.raceName || ''
            break
          case 'personalBestHalfTime':
            exportRow[label] = rowData.personalBestHalf?.netTime || ''
            break
          case 'personalBestHalfRace':
            exportRow[label] = rowData.personalBestHalf?.raceName || ''
            break
          default:
            exportRow[label] = String(rowData[col] ?? '')
        }
      }
    } else {
      exportRow.数据来源 = String(rowData._source || '')
      for (const field of standardFields) {
        exportRow[field.name] = String(rowData[field.id] ?? '')
      }
    }
    return exportRow
  })

  const worksheet = XLSX.utils.json_to_sheet(exportData)

  const colWidths = Object.keys(exportData[0] || {}).map(key => ({
    wch: Math.max(key.length * 2, 12),
  }))
  worksheet['!cols'] = colWidths

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '汇总数据')
  XLSX.writeFile(workbook, filename)
}

export async function parseVerificationExcel(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const results = []
  const sheetsMatched = []

  for (const sheetName of workbook.SheetNames) {
    const lowerName = sheetName.toLowerCase()
    let eventType = null

    if (lowerName.includes('全') || lowerName.includes('full') || lowerName.includes('qmcj')) {
      eventType = 'Full'
    } else if (lowerName.includes('半') || lowerName.includes('half') || lowerName.includes('bmcj')) {
      eventType = 'Half'
    }

    if (!eventType) continue
    sheetsMatched.push(`${sheetName} → ${eventType}`)

    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' })
    for (const row of data) {
      const idNumber = String(row['证件号'] || row['证件号码'] || row['身份证'] || row['身份证号'] || row['idNumber'] || row['id_number'] || '').trim()
      const netTime = String(row['净成绩'] || row['成绩'] || row['netTime'] || row['net_time'] || row['time'] || '').trim()
      const raceName = String(row['赛事名称'] || row['比赛名称'] || row['raceName'] || row['race_name'] || '未知赛事').trim()

      if (idNumber && netTime) {
        results.push({
          idNumber,
          netTime,
          raceName,
          raceDate: String(row['比赛日期'] || row['date'] || '').trim(),
          event: eventType,
        })
      }
    }
  }

  return { results, sheetsMatched }
}

/**
 * 解析黑/白名单 Excel 文件。
 * 表头必须包含"姓名"和"证件号/身份证号"列，手机号列可选。
 *
 * @param {File} file - Excel 文件对象
 * @returns {Promise<Array<{ name: string, idNumber: string, phone: string }>>}
 */
export function parseListExcel(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    if (!rows.length) return []

    const sample = rows[0]
    const columns = Object.keys(sample)
    const nameColumn = columns.find((column) => /姓名/i.test(column))
    const idColumn = columns.find((column) => /证件|身份证/i.test(column))
    const phoneColumn = columns.find((column) => /联系|手机|电话/i.test(column))

    if (!nameColumn || !idColumn) {
      throw new Error('表头必须包含"姓名"和"证件号/身份证号"列。')
    }

    return rows.map((row) => ({
      name: String(row[nameColumn] || '').trim(),
      idNumber: String(row[idColumn] || '').trim(),
      phone: phoneColumn ? String(row[phoneColumn] || '').trim() : '',
    })).filter((row) => row.idNumber)
  })
}
