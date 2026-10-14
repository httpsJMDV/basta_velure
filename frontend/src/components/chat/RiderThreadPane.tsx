import { useMemo } from 'react';
import { ArrowLeft, Bike, Lock } from 'lucide-react';
import { conversationThreadAdapter } from '../../api/client';
import type { Conversation, ThreadMeta } from '../../types';
import ThreadView from './ThreadView';

interface RiderThreadPaneProps {
  conversation: Conversation;
  currentUserId: number;
  /** Refresh the inbox list and its unread badges. */
  onActivity?: () => void;
  /** A back control for narrow layouts. */
  onBack?: () => void;
  className?: string;
}

/**
 * The buyer's or seller's view of a conversation with the delivery rider: text only, labelled "Delivery rider" with
 * the tracking number, read-only once the parcel is done. Messages travel over the existing /conversations
 * endpoints.
 */
export default function RiderThreadPane({ conversation, currentUserId, onActivity, onBack, className = '' }: RiderThreadPaneProps) {
  const conversationId = conversation.id;
  const adapter = useMemo(() => conversationThreadAdapter(conversationId), [conversationId]);
  const initialMeta: ThreadMeta = {
    is_closed: conversation.is_closed ?? false,
    can_send: conversation.can_send ?? true,
    closed_message: conversation.closed_message ?? null,
  };
  const tracking = conversation.parcel?.tracking_number;

  return (
    <div className={`flex flex-col min-h-0 h-full ${className}`}>
      <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-white shadow-xs">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="min-h-11 min-w-11 -ml-2 inline-flex items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </button>
        )}
        <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
          <Bike className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-gray-900 truncate">
            Delivery rider
            {conversation.recipient?.name && conversation.recipient.name !== 'Delivery rider' && (
              <span className="font-semibold text-gray-500"> &bull; {conversation.recipient.name}</span>
            )}
          </h3>
          <p className="text-[11px] text-gray-500 truncate">
            {tracking && (
              <>
                Tracking <span className="font-mono font-semibold text-gray-700">{tracking}</span>
              </>
            )}
            {conversation.is_closed && (
              <span className="ml-2 inline-flex items-center gap-1 font-semibold text-gray-600">
                <Lock className="w-3 h-3" aria-hidden="true" />
                Closed
              </span>
            )}
          </p>
        </div>
      </div>

      <ThreadView
        key={conversationId}
        adapter={adapter}
        currentUserId={currentUserId}
        initialMeta={initialMeta}
        onActivity={onActivity}
        emptyHint="No messages yet. Your delivery rider can message you here while your parcel is on its way."
        className="flex-1"
      />
    </div>
  );
}
