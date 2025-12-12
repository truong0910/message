import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../contexts/UserContext';

interface TypingIndicatorProps {
  conversationId: number;
}

interface TypingUser {
  user_id: number;
  username: string;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ conversationId }) => {
  const { user } = useUser();
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  useEffect(() => {
    if (!user || !conversationId) return;

    // Subscribe to typing status changes
    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_status',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async () => {
          // Fetch current typing users
          const { data } = await supabase
            .from('typing_status')
            .select(`
              user_id,
              users (username)
            `)
            .eq('conversation_id', conversationId)
            .eq('is_typing', true)
            .neq('user_id', user.id);

          if (data) {
            setTypingUsers(
              data.map((item: any) => ({
                user_id: item.user_id,
                username: item.users?.username || 'Someone',
              }))
            );
          }
        }
      )
      .subscribe();

    // Initial fetch
    const fetchTypingUsers = async () => {
      const { data } = await supabase
        .from('typing_status')
        .select(`
          user_id,
          users (username)
        `)
        .eq('conversation_id', conversationId)
        .eq('is_typing', true)
        .neq('user_id', user.id);

      if (data) {
        setTypingUsers(
          data.map((item: any) => ({
            user_id: item.user_id,
            username: item.users?.username || 'Someone',
          }))
        );
      }
    };

    fetchTypingUsers();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user?.id]);

  if (typingUsers.length === 0) return null;

  const typingText = typingUsers.length === 1
    ? `${typingUsers[0].username} đang nhập...`
    : typingUsers.length === 2
      ? `${typingUsers[0].username} và ${typingUsers[1].username} đang nhập...`
      : `${typingUsers.length} người đang nhập...`;

  return (
    <div 
      className="px-3 py-1 text-muted small d-flex align-items-center"
      style={{ background: 'rgba(102, 126, 234, 0.05)' }}
    >
      <div className="typing-dots me-2">
        <span></span>
        <span></span>
        <span></span>
      </div>
      {typingText}
      <style>{`
        .typing-dots {
          display: flex;
          gap: 3px;
        }
        .typing-dots span {
          width: 6px;
          height: 6px;
          background: #667eea;
          border-radius: 50%;
          animation: typing 1.4s infinite both;
        }
        .typing-dots span:nth-child(2) {
          animation-delay: 0.2s;
        }
        .typing-dots span:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes typing {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-4px);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

// Hook to send typing status
export const useTypingStatus = (conversationId: number) => {
  const { user } = useUser();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const setTyping = async (isTyping: boolean) => {
    if (!user || !conversationId) return;
    if (isTypingRef.current === isTyping) return;
    
    isTypingRef.current = isTyping;

    await supabase
      .from('typing_status')
      .upsert({
        conversation_id: conversationId,
        user_id: user.id,
        is_typing: isTyping,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'conversation_id,user_id',
      });
  };

  const handleTyping = () => {
    // Set typing to true
    setTyping(true);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set timeout to stop typing after 3 seconds of inactivity
    timeoutRef.current = setTimeout(() => {
      setTyping(false);
    }, 3000);
  };

  const stopTyping = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setTyping(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setTyping(false);
    };
  }, [conversationId]);

  return { handleTyping, stopTyping };
};

export default TypingIndicator;
