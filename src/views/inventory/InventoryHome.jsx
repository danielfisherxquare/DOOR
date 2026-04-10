import { Navigate, useSearchParams } from 'react-router-dom'
import { buildInventorySurfaceHref } from './useInventorySurface'

export default function InventoryHome() {
    const [searchParams] = useSearchParams()
    const nextParams = new URLSearchParams(searchParams)
    const query = nextParams.toString()
    return <Navigate to={buildInventorySurfaceHref('app', '/inventory', { params: Object.fromEntries(nextParams.entries()) })} replace />
}
