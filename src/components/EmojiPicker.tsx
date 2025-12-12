import React, { useState } from 'react';
import { Button, Popover, OverlayTrigger } from 'react-bootstrap';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  trigger?: React.ReactElement;
}

// Common emojis for chat
const EMOJI_CATEGORIES = {
  'Smileys': ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😜', '🤪', '😎', '🤩', '🥳'],
  'Gestures': ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '🤝', '🙏', '💪', '🤗', '🫡', '🫶', '❤️', '🧡', '💛', '💚', '💙'],
  'Faces': ['😢', '😭', '😤', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '🤖', '😺', '😸', '😻', '🙀'],
  'Objects': ['🎉', '🎊', '🎁', '🏆', '🥇', '⭐', '🌟', '✨', '💫', '🔥', '💯', '✅', '❌', '❓', '❗', '💬', '💭', '🗨️', '📌', '📍'],
};

// Quick reactions for messages
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, trigger }) => {
  const [activeCategory, setActiveCategory] = useState('Smileys');

  const popover = (
    <Popover id="emoji-picker" style={{ maxWidth: '320px' }}>
      <Popover.Header className="py-2">
        <div className="d-flex gap-1 flex-wrap">
          {Object.keys(EMOJI_CATEGORIES).map((category) => (
            <Button
              key={category}
              variant={activeCategory === category ? 'primary' : 'light'}
              size="sm"
              className="py-0 px-2"
              style={{ fontSize: '0.75rem' }}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </Button>
          ))}
        </div>
      </Popover.Header>
      <Popover.Body className="p-2">
        <div 
          className="d-flex flex-wrap gap-1"
          style={{ maxHeight: '200px', overflowY: 'auto' }}
        >
          {EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES].map((emoji) => (
            <Button
              key={emoji}
              variant="light"
              className="p-1"
              style={{ 
                fontSize: '1.3rem', 
                width: '36px', 
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onClick={() => onSelect(emoji)}
            >
              {emoji}
            </Button>
          ))}
        </div>
      </Popover.Body>
    </Popover>
  );

  const defaultTrigger = (
    <Button
      variant="light"
      className="rounded-circle p-0 d-flex align-items-center justify-content-center"
      style={{ width: '38px', height: '38px', fontSize: '1.1rem' }}
    >
      😊
    </Button>
  );

  return (
    <OverlayTrigger 
      trigger="click" 
      placement="top" 
      overlay={popover}
      rootClose
    >
      {trigger ? trigger : defaultTrigger}
    </OverlayTrigger>
  );
};

export default EmojiPicker;
