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
