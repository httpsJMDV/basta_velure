import type { OrderStatusHistory } from '../../types';
import { getStatusLabel, getStatusBadgeClass } from '../../utils/orderStatus';
import { CheckCircle2, Clock, User, Shield, Truck, Building2 } from 'lucide-react';

interface OrderStatusTimelineProps {
  history?: OrderStatusHistory[];
  currentStatus?: string;
}

function getActorIcon(actorType?: string) {
  switch (actorType) {
    case 'admin':
      return <Shield className="w-3.5 h-3.5 text-purple-600" />;
    case 'seller':
      return <Building2 className="w-3.5 h-3.5 text-blue-600" />;
    case 'rider':
      return <Truck className="w-3.5 h-3.5 text-amber-600" />;
    case 'hub':
      return <Building2 className="w-3.5 h-3.5 text-cyan-600" />;
    case 'buyer':
      return <User className="w-3.5 h-3.5 text-emerald-600" />;
    default:
      return <Clock className="w-3.5 h-3.5 text-gray-400" />;
  }
}

function formatActorLabel(actorType?: string) {
  switch (actorType) {
    case 'admin':
      return 'Loved-IT Admin';
    case 'seller':
      return 'Merchant / Seller';
    case 'rider':
      return 'Courier Rider';
    case 'hub':
      return 'Sorting Center';
    case 'buyer':
      return 'Customer';
    case 'system':
      return 'Automated System';
    default:
      return actorType || 'System';
  }
}

export default function OrderStatusTimeline({ history, currentStatus }: OrderStatusTimelineProps) {
  if (!history || history.length === 0) {
    return (
      <div className="py-3 px-4 bg-gray-50 rounded-xl text-center">
        <p className="text-xs text-gray-500">
          Current Status:{' '}
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${getStatusBadgeClass(currentStatus)}`}>
            {getStatusLabel(currentStatus)}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
        {history.map((step, idx) => {
          const isLatest = idx === history.length - 1;

          return (
            <div key={step.id || idx} className="relative flex items-start gap-3">
              {/* Dot */}
              <div
                className={`absolute -left-6 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 ${
                  isLatest
                    ? 'bg-brand-red border-white text-white shadow-xs ring-2 ring-red-100'
                    : 'bg-white border-gray-300 text-gray-400'
                }`}
              >
                {isLatest ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 bg-white border border-gray-100 rounded-xl p-3 shadow-2xs">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${getStatusBadgeClass(step.to_status)}`}>
                    {getStatusLabel(step.to_status)}
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {new Date(step.created_at).toLocaleString('en-PH', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                  {getActorIcon(step.actor_type)}
                  <span className="font-semibold text-gray-700">{formatActorLabel(step.actor_type)}</span>
                </div>

                {step.note && (
                  <p className="mt-1 text-xs text-gray-600 bg-gray-50 rounded-lg p-2 border border-gray-100 italic">
                    "{step.note}"
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
