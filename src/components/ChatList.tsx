import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../contexts/UserContext';
import type { Conversation, Message } from '../types';
import { ListGroup, Spinner, Button } from 'react-bootstrap';
import UserSearch from './UserSearch';

interface ChatListProps {
  onSelectConversation: (conversation: Conversation) => void;
  selectedConversation: Conversation | null;
  onDeleteConversation: (conversationId: number) => void;
}

interface ConversationWithLastMessage extends Conversation {
  lastMessage?: Message;
}

const ChatList: React.FC<ChatListProps> = ({ onSelectConversation, selectedConversation, onDeleteConversation }) => {
  const { user } = useUser();
  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  const handleDeleteConversation = async (e: React.MouseEvent, convId: number) => {
    e.stopPropagation(); // Prevent selecting the conversation
    
    if (!user || deleting) return;
    
    if (!window.confirm('Bạn có chắc muốn xóa cuộc hội thoại này?')) return;
    
    setDeleting(convId);
    
    try {
      // Delete messages first
      await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', convId);
      
      // Delete conversation members
      await supabase
        .from('conversation_members')
        .delete()
        .eq('conversation_id', convId);
      
      // Delete the conversation
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', convId);
      
      if (error) {
        console.error('Error deleting conversation:', error);
        alert('Không thể xóa cuộc hội thoại');
      } else {
        // Remove from local state
        setConversations(prev => prev.filter(c => c.id !== convId));
        // Notify parent if this was the selected conversation
        onDeleteConversation(convId);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Đã xảy ra lỗi khi xóa');
    } finally {
      setDeleting(null);
    }
  };

  const handleConversationCreated = (conversation: Conversation) => {
    setConversations(prev => {
      const exists = prev.find(c => c.id === conversation.id);
      if (exists) return prev;
      return [{ ...conversation }, ...prev];
    });
    onSelectConversation(conversation);
  };

  // Clear conversations when user changes (login/logout)
  useEffect(() => {
    setConversations([]);
    setLoading(true);
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const fetchConversations = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('conversation_members')
        .select(`
          conversation_id,
          conversations (
            id,
            name,
            is_group,
            created_at
          )
        `)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching conversations:', error);
        setLoading(false);
        return;
      }

      const convs = data.map((item: any) => item.conversations).filter(Boolean);

      // Fetch last message and other user's name for each conversation
      const convsWithLastMessage = await Promise.all(
        convs.map(async (conv: Conversation) => {
          const { data: messages } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1);

          // For direct conversations, get the other user's name
          let displayName = conv.name;
          if (!conv.is_group) {
            const { data: members } = await supabase
              .from('conversation_members')
              .select(`
                user_id,
                users (
                  id,
                  username
                )
              `)
              .eq('conversation_id', conv.id)
              .neq('user_id', user.id)
              .limit(1);

            if (members && members.length > 0 && members[0].users) {
              displayName = (members[0].users as any).username;
            }
          }

          return {
            ...conv,
            name: displayName,
            lastMessage: messages?.[0],
          };
        })
      );

      setConversations(convsWithLastMessage);
      setLoading(false);
    };

    fetchConversations();

    // Subscribe to new conversation members (when someone adds you to a conversation)
    const memberChannel = supabase
      .channel(`conversation_members:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_members',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          console.log('New conversation member:', payload);
          const newMember = payload.new as { conversation_id: number; user_id: number };
          
          // Fetch the conversation details
          const { data: convData } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', newMember.conversation_id)
            .single();

          if (convData) {
            // For direct conversations, get the other user's name
            let displayName = convData.name;
            if (!convData.is_group) {
              const { data: members } = await supabase
                .from('conversation_members')
                .select(`
                  user_id,
                  users (
                    id,
                    username
                  )
                `)
                .eq('conversation_id', convData.id)
                .neq('user_id', user.id)
                .limit(1);

              if (members && members.length > 0 && members[0].users) {
                displayName = (members[0].users as any).username;
              }
            }

            setConversations(prev => {
              const exists = prev.find(c => c.id === convData.id);
              if (exists) return prev;
              return [{ ...convData, name: displayName }, ...prev];
            });
          }
        }
      )
      .subscribe();

    // Subscribe to new messages to update last message and bring conversation to top
    const messageChannel = supabase
      .channel(`messages_for_user:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          
          setConversations(prev => {
            const convIndex = prev.findIndex(c => c.id === newMsg.conversation_id);
            if (convIndex === -1) {
              // Conversation not in list, might need to fetch it
              return prev;
            }
            
            // Update last message and move to top
            const updatedConv = {
              ...prev[convIndex],
              lastMessage: newMsg,
            };
            const newConvs = prev.filter((_, i) => i !== convIndex);
            return [updatedConv, ...newConvs];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(memberChannel);
      supabase.removeChannel(messageChannel);
    };
  }, [user]);

  if (loading) {
    return (
      <div className="chat-sidebar d-flex align-items-center justify-content-center">
        <Spinner animation="border" style={{ color: '#667eea' }} />
      </div>
    );
  }

  return (
    <div className="chat-sidebar d-flex flex-column">
      {/* Search Header */}
      <div className="p-3 border-bottom" style={{ background: 'rgba(102, 126, 234, 0.05)' }}>
        <div className="d-flex align-items-center gap-2">
          <div className="position-relative flex-grow-1">
            <input
              type="text"
              className="form-control"
              placeholder="🔍 Tìm kiếm cuộc trò chuyện..."
              style={{
                borderRadius: '20px',
                paddingLeft: '15px',
                border: '1px solid #e0e0e0',
                background: 'white'
              }}
            />
          </div>
          <Button
            onClick={() => setShowUserSearch(true)}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0
            }}
          >
            ✏️
          </Button>
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-grow-1 overflow-auto">
        {conversations.length === 0 ? (
          <div className="text-center p-5">
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>💬</div>
            <h6 style={{ color: '#667eea' }}>Chưa có cuộc trò chuyện</h6>
            <p className="text-muted small mb-3">Bắt đầu trò chuyện với bạn bè ngay!</p>
            <Button
              onClick={() => setShowUserSearch(true)}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '20px',
                padding: '8px 20px'
              }}
            >
              + Tạo cuộc trò chuyện
            </Button>
          </div>
        ) : (
          <ListGroup variant="flush">
            {conversations.map((conv) => (
              <ListGroup.Item
                key={conv.id}
                action
                onClick={() => onSelectConversation(conv)}
                className="conversation-item"
                style={{
                  border: 'none',
                  borderLeft: selectedConversation?.id === conv.id ? '3px solid #667eea' : '3px solid transparent',
                  background: selectedConversation?.id === conv.id ? 'rgba(102, 126, 234, 0.1)' : 'transparent',
                  padding: '12px 15px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div className="d-flex align-items-center">
                  {/* Avatar */}
                  <div 
                    className="me-3 d-flex align-items-center justify-content-center"
                    style={{
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      background: conv.is_group 
                        ? 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'
                        : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: '1.2rem',
                      flexShrink: 0
                    }}
                  >
                    {conv.is_group ? '👥' : (conv.name || 'U')[0].toUpperCase()}
                  </div>

                  {/* Content */}
                  <div className="flex-grow-1 min-width-0">
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <strong 
                        className="text-truncate"
                        style={{ 
                          color: '#333',
                          fontSize: '0.95rem',
                          maxWidth: '150px'
                        }}
                      >
                        {conv.name || 'Unnamed Chat'}
                      </strong>
                      {conv.lastMessage && (
                        <small 
                          className="text-muted ms-2"
                          style={{ fontSize: '0.75rem', flexShrink: 0 }}
                        >
                          {new Date(conv.lastMessage.created_at).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </small>
                      )}
                    </div>
                    {conv.lastMessage ? (
                      <small 
                        className="text-muted text-truncate d-block"
                        style={{ fontSize: '0.85rem' }}
                      >
                        {conv.lastMessage.content}
                      </small>
                    ) : (
                      <small className="text-muted" style={{ fontStyle: 'italic', fontSize: '0.85rem' }}>
                        Chưa có tin nhắn
                      </small>
                    )}
                  </div>

                  {/* Delete Button */}
                  <Button
                    variant="link"
                    size="sm"
                    className="ms-2 p-1"
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                    disabled={deleting === conv.id}
                    style={{
                      color: '#dc3545',
                      opacity: 0.6,
                      transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                  >
                    {deleting === conv.id ? '⏳' : '🗑️'}
                  </Button>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </div>

      <UserSearch
        show={showUserSearch}
        onHide={() => setShowUserSearch(false)}
        onConversationCreated={handleConversationCreated}
      />
    </div>
  );
};

export default ChatList;