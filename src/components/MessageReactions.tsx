import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../contexts/UserContext';
import { Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import type { MessageReaction } from '../types';
import { QUICK_REACTIONS } from './EmojiPicker';

interface MessageReactionsProps {
  messageId: number;
  reactions: MessageReaction[];
  isOwn?: boolean;
  onReactionsChange?: (reactions: MessageReaction[]) => void;
}

interface GroupedReaction {
  emoji: string;
  count: number;
  users: number[];
  hasReacted: boolean;
}

const MessageReactions: React.FC<MessageReactionsProps> = ({ 
  messageId, 
  reactions = [],
  isOwn: _isOwn = false,
  onReactionsChange 
}) => {
  const { user } = useUser();
  const [showPicker, setShowPicker] = useState(false);
  const [localReactions, setLocalReactions] = useState<MessageReaction[]>(reactions);
  void _isOwn; // Reserved for future use (styling)

  useEffect(() => {
    setLocalReactions(reactions);
  }, [reactions]);

  // Group reactions by emoji
  const groupedReactions: GroupedReaction[] = localReactions.reduce((acc, reaction) => {
    const existing = acc.find(r => r.emoji === reaction.emoji);
    if (existing) {
      existing.count++;
      existing.users.push(reaction.user_id);
      if (reaction.user_id === user?.id) {
        existing.hasReacted = true;
      }
    } else {
      acc.push({
        emoji: reaction.emoji,
        count: 1,
        users: [reaction.user_id],
        hasReacted: reaction.user_id === user?.id,
      });
    }
    return acc;
  }, [] as GroupedReaction[]);

  const handleReaction = async (emoji: string) => {
    if (!user) return;

    const existingReaction = localReactions.find(
      r => r.emoji === emoji && r.user_id === user.id
    );

    if (existingReaction) {
      // Remove reaction
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', user.id)
        .eq('emoji', emoji);

      if (!error) {
        const newReactions = localReactions.filter(r => !(r.emoji === emoji && r.user_id === user.id));
        setLocalReactions(newReactions);
        onReactionsChange?.(newReactions);
      }
    } else {
      // Add reaction
      const { data, error } = await supabase
        .from('message_reactions')
        .insert({
          message_id: messageId,
          user_id: user.id,
          emoji: emoji,
        })
        .select()
        .single();

      if (!error && data) {
        const newReactions = [...localReactions, data];
        setLocalReactions(newReactions);
        onReactionsChange?.(newReactions);
      }
    }

    setShowPicker(false);
  };

  return (
    <div className="d-flex align-items-center flex-wrap gap-1 mt-1">
      {/* Display existing reactions */}
      {groupedReactions.map((reaction) => (
        <OverlayTrigger
          key={reaction.emoji}
          placement="top"
          overlay={<Tooltip>{reaction.count} người</Tooltip>}
        >
          <Button
            variant={reaction.hasReacted ? 'primary' : 'light'}
            size="sm"
            className="py-0 px-2 d-flex align-items-center gap-1"
            style={{ 
              fontSize: '0.85rem',
              borderRadius: '12px',
              background: reaction.hasReacted 
                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                : 'rgba(0,0,0,0.05)',
              border: 'none',
            }}
            onClick={() => handleReaction(reaction.emoji)}
          >
            <span>{reaction.emoji}</span>
            <span style={{ fontSize: '0.75rem' }}>{reaction.count}</span>
          </Button>
        </OverlayTrigger>
      ))}

      {/* Add reaction button */}
      <div className="position-relative">
        <Button
          variant="light"
          size="sm"
          className="py-0 px-2"
          style={{ 
            fontSize: '0.85rem', 
            borderRadius: '12px',
            opacity: 0.6,
          }}
          onClick={() => setShowPicker(!showPicker)}
        >
          😊+
        </Button>

        {showPicker && (
          <div
            className="position-absolute bg-white rounded shadow-lg p-2"
            style={{
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              marginBottom: '5px',
            }}
          >
            <div className="d-flex gap-1">
              {QUICK_REACTIONS.map((emoji) => (
                <Button
                  key={emoji}
                  variant="light"
                  className="p-1"
                  style={{ fontSize: '1.2rem', width: '32px', height: '32px' }}
                  onClick={() => handleReaction(emoji)}
                >
                  {emoji}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageReactions;
