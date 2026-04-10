import { useSearchParams } from 'react-router-dom'
import useAuthStore from '../../../stores/authStore'
import AdminView from '../../reimbursement/components/AdminView'

function AdminReimbursementPage() {
  const user = useAuthStore((state) => state.user)
  const [searchParams] = useSearchParams()
  const canViewAll = user?.role === 'super_admin'
  const orgId = searchParams.get('orgId') || user?.orgId

  return <AdminView canViewAll={canViewAll} orgId={orgId} />
}

export default AdminReimbursementPage
