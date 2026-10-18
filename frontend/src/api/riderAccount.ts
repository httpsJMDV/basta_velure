// The rider's own vehicle and license changes (each new document is re-verified by the courier company).
import { http } from './client';
import type { RiderProfileData } from '../types';

export const updateRiderVehicleApi = (form: FormData) =>
  http.post<{ message: string; data: RiderProfileData }>('/rider/vehicle', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);

export const updateRiderLicenseApi = (form: FormData) =>
  http.post<{ message: string; data: RiderProfileData }>('/rider/license', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
