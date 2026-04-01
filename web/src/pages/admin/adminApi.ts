import { supabase } from '../../supabase';

const FUNCTION_NAME = 'admin-api';

async function adminFetch(path: string, method = 'GET', body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No session');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCTION_NAME}/${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || response.statusText);
  }

  return response.json();
}

// Stats
export const getStats = () => adminFetch('stats');

// Organizations
export const getOrganizations = (params?: { search?: string; status?: string; sort?: string; order?: string }) => {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.status) qs.set('status', params.status);
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.order) qs.set('order', params.order);
  const q = qs.toString();
  return adminFetch(`organizations${q ? '?' + q : ''}`);
};

export const getOrganization = (id: string) => adminFetch(`organizations/${id}`);
export const createOrganization = (data: Record<string, unknown>) => adminFetch('organizations', 'POST', data);
export const updateOrganization = (id: string, data: Record<string, unknown>) => adminFetch(`organizations/${id}`, 'PATCH', data);
export const getOrgMembers = (orgId: string) => adminFetch(`organizations/${orgId}/members`);
export const inviteToOrg = (orgId: string, email: string, role: string) => adminFetch(`organizations/${orgId}/invite`, 'POST', { email, role });
export const suspendAllMembers = (orgId: string) => adminFetch(`organizations/${orgId}/suspend-all`, 'POST', {});
export const updateOrgMember = (orgId: string, userId: string, data: Record<string, unknown>) => adminFetch(`organizations/${orgId}/members/${userId}`, 'PATCH', data);
export const removeOrgMember = (orgId: string, userId: string) => adminFetch(`organizations/${orgId}/members/${userId}`, 'DELETE');
export const getOrgActivity = (orgId: string) => adminFetch(`organizations/${orgId}/activity`);

// Billing
export const getBilling = (orgId?: string) => adminFetch(`billing${orgId ? '?org_id=' + orgId : ''}`);
export const recordBilling = (data: Record<string, unknown>) => adminFetch('billing/record', 'POST', data);
export const updateBillingRecord = (id: string, data: Record<string, unknown>) => adminFetch(`billing/${id}`, 'PATCH', data);

// Users
export const getUsers = (params?: { search?: string; plan?: string; has_org?: string; sort?: string; order?: string; limit?: number; offset?: number }) => {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.plan) qs.set('plan', params.plan);
  if (params?.has_org) qs.set('has_org', params.has_org);
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.order) qs.set('order', params.order);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const q = qs.toString();
  return adminFetch(`users${q ? '?' + q : ''}`);
};

export const updateUser = (id: string, data: Record<string, unknown>) => adminFetch(`users/${id}`, 'PATCH', data);

// Invitations
export const getInvitations = (orgId: string) => adminFetch(`invitations?org_id=${orgId}`);
export const deleteInvitation = (id: string) => adminFetch(`invitations/${id}`, 'DELETE');

// Verify
export const verifyAdmin = () => adminFetch('verify');
