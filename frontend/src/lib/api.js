import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
});

// Request interceptor — attach access token
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        const { accessToken, refreshToken: newRefresh } = res.data.data;

        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', newRefresh);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/auth/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// Auth API
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  logout: (data) => api.post('/auth/logout', data),
  refresh: (data) => api.post('/auth/refresh', data),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
};

// Tickets API
export const ticketAPI = {
  list: (params) => api.get('/tickets', { params }),
  get: (id) => api.get(`/tickets/${id}`),
  create: (data) => api.post('/tickets', data),
  update: (id, data) => api.put(`/tickets/${id}`, data),
  delete: (id) => api.delete(`/tickets/${id}`),
  addComment: (id, data) => api.post(`/tickets/${id}/comments`, data),
  uploadFiles: (ticketId, formData) => api.post(`/upload/ticket/${ticketId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  downloadReport: (id) => api.get(`/tickets/${id}/report`, { responseType: 'blob' }),
};

// Users API
export const userAPI = {
  list: (params) => api.get('/users', { params }),
  get: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  permanentDelete: (id) => api.delete(`/users/${id}/permanent`),
  updateProfile: (data) => api.put('/users/profile', data),
  resetPassword: (id, data) => api.put(`/users/${id}/reset-password`, data),
};

// Dashboard API
export const dashboardAPI = {
  stats: (params) => api.get('/dashboard', { params }),
};

// Reports API
export const reportAPI = {
  list: (params) => api.get('/reports', { params }),
  exportExcel: (params) => api.get('/reports/export/excel', {
    params,
    responseType: 'blob',
  }),
  exportPDF: (params) => api.get('/reports/export/pdf', {
    params,
    responseType: 'blob',
  }),
};

// Departments API
export const departmentAPI = {
  list: (params) => api.get('/departments', { params }),
  create: (data) => api.post('/departments', data),
  update: (id, data) => api.put(`/departments/${id}`, data),
  delete: (id) => api.delete(`/departments/${id}`),
};

// Categories API
export const categoryAPI = {
  list: (params) => api.get('/categories', { params }),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
};

// Settings API
export const settingAPI = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
  uploadLogo: (formData) => api.post('/settings/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  deleteLogo: () => api.delete('/settings/logo'),
};

// Branches API
export const branchAPI = {
  list: (params) => api.get('/branches', { params }),
  get: (id) => api.get(`/branches/${id}`),
  create: (data) => api.post('/branches', data),
  update: (id, data) => api.put(`/branches/${id}`, data),
  delete: (id) => api.delete(`/branches/${id}`),
  // Signatures per branch
  updateSignatures: (id, data) => api.patch(`/branches/${id}/signatures`, data),
  // Regulations
  getRegulations: (branchId, params) => api.get(`/branches/${branchId}/regulations`, { params }),
  createRegulation: (branchId, data) => api.post(`/branches/${branchId}/regulations`, data),
  updateRegulation: (branchId, regId, data) => api.put(`/branches/${branchId}/regulations/${regId}`, data),
  deleteRegulation: (branchId, regId) => api.delete(`/branches/${branchId}/regulations/${regId}`),
};

// Assets API
export const assetAPI = {
  list:    (params) => api.get('/assets', { params }),
  summary: (params) => api.get('/assets/summary', { params }),
  get:     (id)     => api.get(`/assets/${id}`),
  create:  (data)   => {
    const isForm = data instanceof FormData;
    return api.post('/assets', data, isForm ? { headers: { 'Content-Type': 'multipart/form-data' } } : {});
  },
  update:  (id, data) => {
    const isForm = data instanceof FormData;
    return api.put(`/assets/${id}`, data, isForm ? { headers: { 'Content-Type': 'multipart/form-data' } } : {});
  },
  delete:  (id)     => api.delete(`/assets/${id}`),
  downloadHandoverLetter: (id) => api.get(`/assets/${id}/handover-letter`, { responseType: 'blob' }),
  downloadReport: (params) => api.get('/assets/report', { params, responseType: 'blob' }),
};

// Notifications API
export const notificationAPI = {
  list: (params) => api.get('/notifications', { params }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
  delete: (id) => api.delete(`/notifications/${id}`),
};

// Purchase Orders API
export const poAPI = {
  list:    (params) => api.get('/purchase-orders', { params }),
  summary: (params) => api.get('/purchase-orders/summary', { params }),
  get:     (id)     => api.get(`/purchase-orders/${id}`),
  create:  (data)   => api.post('/purchase-orders', data),
  update:  (id, data) => api.put(`/purchase-orders/${id}`, data),
  updateStatus: (id, data) => api.patch(`/purchase-orders/${id}/status`, data),
  delete:  (id)     => api.delete(`/purchase-orders/${id}`),
  downloadPDF: (id) => api.get(`/purchase-orders/${id}/pdf`, { responseType: 'blob' }),
  uploadAttachments: (id, formData) => api.post(`/purchase-orders/${id}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAttachment: (id, attachId) => api.delete(`/purchase-orders/${id}/attachments/${attachId}`),
};

// IT Network Tools API
export const toolsAPI = {
  ping:       (data) => api.post('/tools/ping',        data),
  portScan:   (data) => api.post('/tools/port-scan', data),
};

// Vendor PO API
export const vendorPOAPI = {
  list:              (params)   => api.get('/vendor-po', { params }),
  get:               (id)       => api.get(`/vendor-po/${id}`),
  create:            (data)     => api.post('/vendor-po', data),
  update:            (id, data) => api.put(`/vendor-po/${id}`, data),
  delete:            (id)       => api.delete(`/vendor-po/${id}`),
  downloadPDF:       (id)       => api.get(`/vendor-po/${id}/pdf`, { responseType: 'blob' }),
  uploadAttachments: (id, fd)   => api.post(`/vendor-po/${id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAttachment:  (id, aid)  => api.delete(`/vendor-po/${id}/attachments/${aid}`),
};

// Internal PO API
export const internalPOAPI = {
  list:              (params)   => api.get('/internal-po', { params }),
  get:               (id)       => api.get(`/internal-po/${id}`),
  create:            (data)     => api.post('/internal-po', data),
  update:            (id, data) => api.put(`/internal-po/${id}`, data),
  delete:            (id)       => api.delete(`/internal-po/${id}`),
  downloadPDF:       (id)       => api.get(`/internal-po/${id}/pdf`, { responseType: 'blob' }),
  uploadAttachments: (id, fd)   => api.post(`/internal-po/${id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAttachment:  (id, aid)  => api.delete(`/internal-po/${id}/attachments/${aid}`),
};

// Selisih PO API
export const selisihPOAPI = {
  list:              (params)   => api.get('/selisih-po', { params }),
  get:               (id)       => api.get(`/selisih-po/${id}`),
  create:            (data)     => api.post('/selisih-po', data),
  update:            (id, data) => api.put(`/selisih-po/${id}`, data),
  delete:            (id)       => api.delete(`/selisih-po/${id}`),
  downloadPDF:       (id)       => api.get(`/selisih-po/${id}/pdf`, { responseType: 'blob' }),
  uploadAttachments: (id, fd)   => api.post(`/selisih-po/${id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAttachment:  (id, aid)  => api.delete(`/selisih-po/${id}/attachments/${aid}`),
};

// Tanda Terima API
export const tandaTerimaAPI = {
  list:              (params)   => api.get('/tanda-terima', { params }),
  get:               (id)       => api.get(`/tanda-terima/${id}`),
  create:            (data)     => api.post('/tanda-terima', data),
  update:            (id, data) => api.put(`/tanda-terima/${id}`, data),
  delete:            (id)       => api.delete(`/tanda-terima/${id}`),
  downloadPDF:       (id)       => api.get(`/tanda-terima/${id}/pdf`, { responseType: 'blob' }),
  uploadAttachments: (id, fd)   => api.post(`/tanda-terima/${id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAttachment:  (id, aid)  => api.delete(`/tanda-terima/${id}/attachments/${aid}`),
};
