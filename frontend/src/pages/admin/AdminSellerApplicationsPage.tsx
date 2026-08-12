import { useEffect, useState } from 'react';
import { approveSellerApi, getSellerApplicationsApi, rejectSellerApi } from '../../api/client';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import type { ApplicationStatus, SellerApplication } from '../../types';

const TABS: { label: string; value: ApplicationStatus }[] = [
  { label: 'Pending',  value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
];

export default function AdminSellerApplicationsPage() {
  const [tab, setTab]                     = useState<ApplicationStatus>('pending');
  const [applications, setApplications]   = useState<SellerApplication[]>([]);
  const [loading, setLoading]             = useState(false);
  const [rejectModal, setRejectModal]     = useState<{ id: number } | null>(null);
  const [rejectReason, setRejectReason]   = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await getSellerApplicationsApi(tab);
      setApplications(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tab]);

  async function handleApprove(id: number) {
    setActionLoading(true);
    try { await approveSellerApi(id); await load(); }
    finally { setActionLoading(false); }
  }

  async function handleReject() {
    if (!rejectModal) return;
    setActionLoading(true);
    try {
      await rejectSellerApi(rejectModal.id, rejectReason);
      setRejectModal(null);
      setRejectReason('');
      await load();
    } finally { setActionLoading(false); }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-black">Seller Applications</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 w-fit shadow-sm border border-gray-100">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={[
              'min-h-[40px] px-5 rounded-lg text-sm font-semibold transition-colors',
              tab === t.value ? 'bg-brand-red text-white' : 'text-gray-500 hover:text-brand-black',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {!loading && applications.length === 0 && (
        <p className="text-sm text-gray-400">No {tab} applications.</p>
      )}

      <div className="flex flex-col gap-4">
        {applications.map((app) => (
          <div key={app.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-brand-black">{app.shop_name}</span>
                  <Badge label={app.application_status} variant={app.application_status} />
                </div>
                <p className="text-sm text-gray-500">
                  {app.user.first_name} {app.user.last_name} · {app.user.email}
                </p>
                <p className="text-sm text-gray-500">
                  {app.government_id_type.replace(/_/g, ' ').toUpperCase()} · DOB: {app.date_of_birth}
                </p>
                <p className="text-sm text-gray-500">GCash: {app.payout_gcash_number}</p>
                <a
                  href={app.government_id_image_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-red underline mt-1 inline-block"
                >
                  View ID Image
                </a>
                {app.rejection_reason && (
                  <p className="text-xs text-red-600 mt-1">Reason: {app.rejection_reason}</p>
                )}
              </div>

              {tab === 'pending' && (
                <div className="flex gap-2 shrink-0">
                  <Button variant="primary" loading={actionLoading} onClick={() => handleApprove(app.id)}>
                    Approve
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setRejectModal({ id: app.id }); setRejectReason(''); }}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-brand-black mb-3">Reject Application</h2>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection…"
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red resize-none"
            />
            <div className="flex gap-3 mt-4 justify-end">
              <Button variant="ghost" onClick={() => setRejectModal(null)}>Cancel</Button>
              <Button
                variant="danger"
                loading={actionLoading}
                onClick={handleReject}
                disabled={!rejectReason.trim()}
              >
                Confirm Reject
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
