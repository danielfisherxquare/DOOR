import request from '../utils/request'

function approvalBase(surface = 'app') {
  return '/' + (surface === 'admin' ? 'admin' : 'app') + '/approvals'
}

const approvalApi = {
  listTasks: (surface = 'app', params = {}) => request.get(approvalBase(surface) + '/tasks', { params }),
  approveTask: (surface = 'app', taskId, data = {}) => (
    request.post(approvalBase(surface) + '/tasks/' + encodeURIComponent(taskId) + '/approve', data)
  ),
  rejectTask: (surface = 'app', taskId, data = {}) => (
    request.post(approvalBase(surface) + '/tasks/' + encodeURIComponent(taskId) + '/reject', data)
  ),
  requestChanges: (surface = 'app', taskId, data = {}) => (
    request.post(approvalBase(surface) + '/tasks/' + encodeURIComponent(taskId) + '/request-changes', data)
  ),
  assignTask: (surface = 'app', taskId, data = {}) => (
    request.post(approvalBase(surface) + '/tasks/' + encodeURIComponent(taskId) + '/assign', data)
  ),
  listRaceStaffAssignments: (raceId, params = {}) => (
    request.get('/admin/races/' + encodeURIComponent(raceId) + '/staff-assignments', { params })
  ),
  createRaceStaffAssignment: (raceId, data = {}) => (
    request.post('/admin/races/' + encodeURIComponent(raceId) + '/staff-assignments', data)
  ),
  updateRaceStaffAssignment: (raceId, assignmentId, data = {}) => (
    request.patch('/admin/races/' + encodeURIComponent(raceId) + '/staff-assignments/' + encodeURIComponent(assignmentId), data)
  ),
  archiveRaceStaffAssignment: (raceId, assignmentId) => (
    request.delete('/admin/races/' + encodeURIComponent(raceId) + '/staff-assignments/' + encodeURIComponent(assignmentId))
  ),
}

export default approvalApi
