export function unwrapData(response) {
  if (response?.data !== undefined) {
    return response.data
  }
  return response
}

export function unwrapRecordsQueryResult(response) {
  const data = unwrapData(response)
  if (data && typeof data === 'object') {
    return data
  }
  return { records: [], total: 0 }
}

export function unwrapListData(response, candidateKeys = []) {
  const data = unwrapData(response)
  if (Array.isArray(data)) return data

  const keys = [...candidateKeys, 'data', 'items', 'records', 'results']
  const findList = (payload, depth = 0) => {
    if (Array.isArray(payload)) return payload
    if (!payload || typeof payload !== 'object') return null

    for (const key of keys) {
      if (Array.isArray(payload[key])) return payload[key]
    }

    if (depth < 1 && payload.data && typeof payload.data === 'object') {
      return findList(payload.data, depth + 1)
    }

    return null
  }

  const list = findList(data)
  if (list) return list

  return []
}
