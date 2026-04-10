import { Navigate, useSearchParams } from 'react-router-dom'

export default function AssetDesigner() {
  const [searchParams] = useSearchParams()
  const nextParams = new URLSearchParams()

  const orgId = searchParams.get('orgId')
  const warehouseId = searchParams.get('warehouseId')
  const sceneType = searchParams.get('sceneType')
  const projectType = searchParams.get('projectType') || (warehouseId ? 'warehouse' : 'asset')
  const resolvedSceneType = sceneType || (projectType === 'warehouse' ? 'warehouse' : 'outdoor-event')

  if (orgId) nextParams.set('orgId', orgId)
  if (warehouseId) nextParams.set('importWarehouseId', warehouseId)
  if (resolvedSceneType) nextParams.set('sceneType', resolvedSceneType)
  if (projectType) nextParams.set('projectType', projectType)

  const query = nextParams.toString()
  return <Navigate to={`/app/3d-studio${query ? `/new?${query}` : ''}`} replace />
}
