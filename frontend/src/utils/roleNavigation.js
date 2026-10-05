export function dashboardPathForRole(role) {
  return role === 'manager' ? '/manager/dashboard' : '/agent/dashboard'
}