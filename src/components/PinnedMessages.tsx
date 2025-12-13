import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import type { Message } from '../types';
import { Collapse, Button, Badge } from 'react-bootstrap';

interface PinnedMessagesProps {
  conversationId: number;
  onScrollToMessage: (messageId: number) => void;
}

interface PinnedMessage extends Message {
  pinned_by_user?: {
    username: string;
  };
}

const PinnedMessages: React.FC<PinnedMessagesProps> = ({
  conversationId,
  onScrollToMessage,
}) => {
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const fetchPinnedMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        pinned_by_user:users!messages_pinned_by_fkey(username)
      `)
      .eq('conversation_id', conversationId)
      .eq('is_pinned', true)
      .order('pinned_at', { ascending: false });

    if (error) {
      console.error('Error fetching pinned messages:', error);
      // Fallback query without join
      const { data: fallbackData } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('is_pinned', true)
        .order('pinned_at', { ascending: false });
      
      setPinnedMessages(fallbackData || []);
    } else {
      setPinnedMessages(data || []);
    }
  };

  useEffect(() => {
    fetchPinnedMessages();

    // Subscribe to changes
    const channel = supabase
      .channel(`pinned_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          // Refresh pinned messages when any message changes
          if ((payload.new as any)?.is_pinned !== undefined || 
              (payload.old as any)?.is_pinned !== undefined) {
            fetchPinnedMessages();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const handleUnpin = async (messageId: number) => {
    const { error } = await supabase
      .from('messages')
      .update({ 
        is_pinned: false, 
        pinned_at: null, 
        pinned_by: null 
      })
      .eq('id', messageId);

    if (!error) {
      setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
    }
  };

  if (pinnedMessages.length === 0) {
    return null;
  }

  return (
    <div className="border-bottom" style={{ background: '#fff9e6' }}>
      {/* Toggle Header */}
      <div
        className="px-3 py-2 d-flex align-items-center justify-content-between"
        style={{ cursor: 'pointer' }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="d-flex align-items-center gap-2">
          <span>📌</span>
          <span className="fw-bold" style={{ color: '#856404' }}>
            Tin nhắn đã ghim
          </span>
          <Badge bg="warning" text="dark" pill>
            {pinnedMessages.length}
          </Badge>
        </div>
        <span style={{ color: '#856404' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </div>

      {/* Pinned Messages List */}
      <Collapse in={isOpen}>
        <div>
          <div 
            className="px-3 pb-2" 
            style={{ maxHeight: '200px', overflowY: 'auto' }}
          >
            {pinnedMessages.map((msg) => (
              <div
                key={msg.id}
                className="d-flex align-items-start justify-content-between p-2 mb-1 rounded"
                style={{ 
                  background: 'white',
                  border: '1px solid #ffc107',
                  cursor: 'pointer'
                }}
                onClick={() => onScrollToMessage(msg.id)}
              >
                <div className="flex-grow-1 min-width-0">
                  <div 
                    className="text-truncate small"
                    style={{ color: '#333' }}
                  >
                    {msg.is_deleted ? (
                      <span className="text-muted fst-italic">Tin nhắn đã bị xóa</span>
                    ) : msg.message_type === 'image' ? (
                      <span>🖼️ Hình ảnh</span>
                    ) : msg.message_type === 'video' ? (
                      <span>🎥 Video</span>
                    ) : msg.message_type === 'file' ? (
                      <span>📄 {msg.file_name}</span>
                    ) : msg.message_type === 'poll' ? (
                      <span>📊 Bình chọn</span>
                    ) : (
                      msg.content
                    )}
                  </div>
                  <small className="text-muted">
                    {new Date(msg.created_at).toLocaleString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </small>
                </div>
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 ms-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnpin(msg.id);
                  }}
                  title="Bỏ ghim"
                  style={{ color: '#dc3545' }}
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        </div>
      </Collapse>
    </div>
  );
};

export default PinnedMessages;
