import {
  RECORD_EXACT_FILTER_FIELDS,
  RECORD_FILTER_FIELDS,
  RECORD_PRESENCE_ONLY_FILTER_FIELDS,
} from '@arcspro/contracts'

const HIDDEN_FILTER_FIELDS = new Set(RECORD_PRESENCE_ONLY_FILTER_FIELDS)
export const FILTERABLE_RECORD_FIELDS = new Set(
  RECORD_FILTER_FIELDS.filter(
    (field) => !field.startsWith('_') && !HIDDEN_FILTER_FIELDS.has(field),
  ),
)

const STANDARD_OPERATORS = [
  { value: 'equals', label: '等于' },
  { value: 'contains', label: '包含' },
  { value: 'startsWith', label: '开头为' },
  { value: 'endsWith', label: '结尾为' },
  { value: 'notEquals', label: '不等于' },
]

const EXACT_OPERATORS = [{ value: 'equals', label: '精确等于' }]
const EXACT_FILTER_FIELDS = new Set(RECORD_EXACT_FILTER_FIELDS)

export function getRecordFilterOperators(field) {
  return EXACT_FILTER_FIELDS.has(field) ? EXACT_OPERATORS : STANDARD_OPERATORS
}

export function changeRecordFilterField(filter, field) {
  return {
    ...filter,
    field,
    operator: getRecordFilterOperators(field)[0].value,
    value: '',
  }
}
