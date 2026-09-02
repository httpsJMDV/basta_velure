import { useState, useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface Props {
  onSelectEmoji: (emoji: string) => void;
  isOpen: boolean;
  onClose: () => void;
  position?: 'top' | 'bottom';
}

const EMOJI_CATEGORIES = [
  {
    name: 'Smileys',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😮‍💨', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤔', '🫣', '🤭', '🫢', '🫡', '🤫', '🫠', '🤐', '😴', '🤤', '🤒', '🤕', '🤢', '🤮', '🤧', '😷'],
  },
  {
    name: 'Gestures',
    emojis: ['👍', '👎', '👌', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙌', '👐', '🤲', '👏', '🙏', '💪', '✍️', '💅', '🤳'],
  },
  {
    name: 'Hearts & Love',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '💌', '💐', '🌹', '🥀', '🌺', '🌸', '✨', '⭐', '🌟', '💫', '🔥', '💯'],
  },
  {
    name: 'Shopping & Commerce',
    emojis: ['🛍️', '🛒', '🏷️', '📦', '🎁', '💳', '💵', '💰', '🪙', '🧾', '🏪', '🏬', '👗', '👕', '👖', '👟', '👠', '👜', '🎒', '💄', '💍', '⌚', '📱', '💻', '📷', '🛵', '🚚', '📦'],
  },
  {
    name: 'Reactions & Objects',
    emojis: ['✅', '❌', '⚠️', '❗', '❓', '💬', '📢', '🔔', '🔒', '🎉', '🎊', '🎀', '🎈', '🚀', '⏳', '⏰', '📌', '📍', '💡', '🏆', '🥇', '👑'],
  },
];

export default function EmojiPickerPopover({
  onSelectEmoji,
  isOpen,
  onClose,
  position = 'top',
}: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={`absolute z-40 w-72 sm:w-80 bg-white rounded-2xl shadow-xl border border-gray-200/90 overflow-hidden flex flex-col ${
        position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
      } left-0 sm:left-auto right-0 sm:right-auto animate-in fade-in zoom-in-95 duration-150`}
    >
      {/* Search Header */}
      <div className="p-2.5 border-b border-gray-100 flex items-center gap-2 bg-gray-50/70">
        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-1" />
        <input
          type="text"
          placeholder="Search emojis..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-xs text-gray-800 placeholder-gray-400 outline-none"
          autoFocus
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-gray-400 hover:text-gray-600 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Category Tabs */}
      {!search && (
        <div className="flex border-b border-gray-100 px-2 pt-1 gap-1 overflow-x-auto text-[11px]">
          {EMOJI_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.name}
              type="button"
              onClick={() => setActiveCategory(idx)}
              className={`px-2 py-1 font-semibold rounded-lg transition-colors whitespace-nowrap ${
                activeCategory === idx
                  ? 'bg-rose-50 text-brand-red'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Emoji Grid */}
      <div className="p-2.5 max-h-52 overflow-y-auto grid grid-cols-7 sm:grid-cols-8 gap-1 text-xl">
        {(search
          ? EMOJI_CATEGORIES.flatMap((c) => c.emojis)
          : EMOJI_CATEGORIES[activeCategory].emojis
        ).map((emoji, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              onSelectEmoji(emoji);
            }}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center hover:scale-125 transition-transform duration-100 select-none"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
