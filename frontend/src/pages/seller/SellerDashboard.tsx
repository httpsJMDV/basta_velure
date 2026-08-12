import { useAuth } from '../../hooks/useAuth';
import Badge from '../../components/ui/Badge';
import type { ApplicationStatus } from '../../types';

const statusVariant: Record<ApplicationStatus, 'pending' | 'approved' | 'rejected'> = {
  pending: 'pending', approved: 'approved', rejected: 'rejected',
};

export default function SellerDashboard() {
  const { user } = useAuth();
  const profile = user?.seller_profile;

  if (!profile) return null;

  return (
    <div className="min-h-screen bg-brand-gray-soft px-4 py-10">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-brand-black mb-1">
          Welcome, {user?.first_name}!
        </h1>
        <p className="text-sm text-gray-500 mb-8">{profile.shop_name}</p>

        {profile.application_status !== 'approved' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Badge
                label={profile.application_status.charAt(0).toUpperCase() + profile.application_status.slice(1)}
                variant={statusVariant[profile.application_status]}
              />
              <span className="text-sm font-semibold text-brand-black">
                {profile.application_status === 'pending'
                  ? 'Application Under Review'
                  : 'Application Rejected'}
              </span>
            </div>

            {profile.application_status === 'pending' && (
              <p className="text-sm text-gray-600">
                Your seller application is being reviewed by our team. This usually takes 1–3 business days.
                You'll be notified once a decision is made.
              </p>
            )}

            {profile.application_status === 'rejected' && (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  Unfortunately, your application was not approved for the following reason:
                </p>
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {profile.rejection_reason ?? 'No reason provided.'}
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  You may contact support to appeal or re-apply.
                </p>
              </div>
            )}
          </div>
        )}

        {profile.application_status === 'approved' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-sm text-gray-600">Your seller dashboard is ready. More features coming soon.</p>
          </div>
        )}
      </div>
    </div>
  );
}
