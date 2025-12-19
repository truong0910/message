import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../contexts/UserContext';
import type { Conversation, Message, MessageReaction } from '../types';
import { Button, Form, Modal, ProgressBar, Dropdown } from 'react-bootstrap';
import VideoCall from './VideoCall';
import MessageReactions from './MessageReactions';
import TypingIndicator, { useTypingStatus } from './TypingIndicator';
import EmojiPicker from './EmojiPicker';
import SearchMessages from './SearchMessages';
import { CreatePoll, PollDisplay } from './Poll';
import GroupSettings from './GroupSettings';
import PinnedMessages from './PinnedMessages';

interface ChatWindowProps {
  conversation: Conversation | null;
  onBack?: () => void;
}

interface IncomingCall {
  conversationId: number;
  callerId: number;
  callerName: string;
}

// Helper to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const ChatWindow: React.FC<ChatWindowProps> = ({ conversation, onBack }) => {
  const { user } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [messageMenu, setMessageMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [reactions, setReactions] = useState<Record<number, MessageReaction[]>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const MESSAGES_PER_PAGE = 30;

  // Typing status hook
  const { handleTyping, stopTyping } = useTypingStatus(conversation?.id || 0);

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  // Listen for incoming calls
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`incoming_calls:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `callee_id=eq.${user.id}`,
        },
        (payload) => {
          const signal = payload.new as any;
          if (signal.type === 'call-request') {
            setIncomingCall({
              conversationId: signal.conversation_id,
              callerId: signal.caller_id,
              callerName: signal.signal_data?.callerName || 'Unknown',
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Clear messages when conversation changes or user logs out
  useEffect(() => {
    setMessages([]);
    setNewMessage('');
    setHasMoreMessages(true);
  }, [conversation?.id, user?.id]);

  // Load older messages when scrolling to top
  const loadOlderMessages = async () => {
    if (!conversation || !user || loadingOlder || !hasMoreMessages || messages.length === 0) return;
    
    setLoadingOlder(true);
    const oldestMessage = messages[0];
    
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .lt('created_at', oldestMessage.created_at)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_PER_PAGE);

    if (error) {
      console.error('Error loading older messages:', error);
      setLoadingOlder(false);
      return;
    }

    if (data && data.length > 0) {
      // Reverse to get correct order (oldest first)
      const olderMessages = data.reverse();
      
      // Save current scroll position
      const container = messagesContainerRef.current;
      const previousScrollHeight = container?.scrollHeight || 0;
      
      setMessages(prev => [...olderMessages, ...prev]);
      
      // Restore scroll position after adding messages
      setTimeout(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          container.scrollTop = newScrollHeight - previousScrollHeight;
        }
      }, 50);
      
      // Fetch reactions for older messages
      const messageIds = olderMessages.map((m: Message) => m.id);
      const { data: reactionsData } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', messageIds);

      if (reactionsData) {
        setReactions(prev => {
          const newReactions = { ...prev };
          reactionsData.forEach((r: MessageReaction) => {
            if (!newReactions[r.message_id]) {
              newReactions[r.message_id] = [];
            }
            newReactions[r.message_id].push(r);
          });
          return newReactions;
        });
      }
      
      if (data.length < MESSAGES_PER_PAGE) {
        setHasMoreMessages(false);
      }
    } else {
      setHasMoreMessages(false);
    }
    
    setLoadingOlder(false);
  };

  // Handle scroll event
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      // Load more when scrolled near top (within 100px)
      if (container.scrollTop < 100 && !loadingOlder && hasMoreMessages) {
        loadOlderMessages();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages, loadingOlder, hasMoreMessages, conversation?.id]);

  useEffect(() => {
    if (!conversation || !user) return;

    const fetchMessages = async () => {
      // Fetch newest messages first (limited)
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: false })
        .limit(MESSAGES_PER_PAGE);

      if (error) {
        console.error('Error fetching messages:', error);
        return;
      }

      // Reverse to display in correct order (oldest first)
      const messagesInOrder = data ? data.reverse() : [];
      setMessages(messagesInOrder);
      setHasMoreMessages(data ? data.length >= MESSAGES_PER_PAGE : false);

      // Fetch reactions for all messages
      if (messagesInOrder.length > 0) {
        const messageIds = messagesInOrder.map((m: Message) => m.id);
        const { data: reactionsData } = await supabase
          .from('message_reactions')
          .select('*')
          .in('message_id', messageIds);

        if (reactionsData) {
          const reactionsMap: Record<number, MessageReaction[]> = {};
          reactionsData.forEach((r: MessageReaction) => {
            if (!reactionsMap[r.message_id]) {
              reactionsMap[r.message_id] = [];
            }
            reactionsMap[r.message_id].push(r);
          });
          setReactions(reactionsMap);
        }
      }
      
      // Scroll to bottom after everything is loaded
      setTimeout(() => scrollToBottom(), 200);
    };

    fetchMessages();

    // Subscribe to new messages using Supabase Realtime
    const channel = supabase
      .channel(`room:${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        async (payload) => {
          const newMsgId = (payload.new as any).id;
          
          // Fetch full message data to ensure we have poll_id and other fields
          const { data: fullMsg } = await supabase
            .from('messages')
            .select('*')
            .eq('id', newMsgId)
            .single();
          
          if (fullMsg) {
            setMessages((prev) => {
              if (prev.some(m => m.id === fullMsg.id)) {
                return prev;
              }
              return [...prev, fullMsg];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !conversation || !user || sending) return;

    const messageContent = newMessage;
    setNewMessage('');
    setSending(true);
    stopTyping(); // Stop typing indicator when sending

    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          conversation_id: conversation.id,
          sender_id: user.id,
          content: messageContent,
          message_type: 'text',
          reply_to_id: replyingTo?.id || null,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error sending message:', error);
      setNewMessage(messageContent);
    } else if (data) {
      // Add reply_to info if replying
      const newMsg = replyingTo ? { ...data, reply_to: replyingTo } : data;
      setMessages((prev) => {
        if (prev.some(m => m.id === data.id)) {
          return prev;
        }
        return [...prev, newMsg];
      });
      setReplyingTo(null);
    }
    setSending(false);
  };

  // Delete message handler
  const handleDeleteMessage = async (msgId: number) => {
    if (!user) return;
    
    const confirmed = window.confirm('Bạn có chắc muốn xóa tin nhắn này?');
    if (!confirmed) return;

    const { error } = await supabase
      .from('messages')
      .update({ is_deleted: true, content: 'Tin nhắn đã bị xóa' })
      .eq('id', msgId)
      .eq('sender_id', user.id); // Only delete own messages

    if (error) {
      console.error('Error deleting message:', error);
      alert('Không thể xóa tin nhắn');
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, is_deleted: true, content: 'Tin nhắn đã bị xóa' } : m
        )
      );
    }
    setMessageMenu(null);
  };

  // Pin message handler
  const handlePinMessage = async (msgId: number) => {
    if (!user) return;

    const { error } = await supabase
      .from('messages')
      .update({ 
        is_pinned: true, 
        pinned_at: new Date().toISOString(),
        pinned_by: user.id
      })
      .eq('id', msgId);

    if (error) {
      console.error('Error pinning message:', error);
      alert('Không thể ghim tin nhắn');
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, is_pinned: true, pinned_at: new Date().toISOString(), pinned_by: user.id } : m
        )
      );
    }
    setMessageMenu(null);
  };

  // Unpin message handler
  const handleUnpinMessage = async (msgId: number) => {
    const { error } = await supabase
      .from('messages')
      .update({ 
        is_pinned: false, 
        pinned_at: null,
        pinned_by: null
      })
      .eq('id', msgId);

    if (error) {
      console.error('Error unpinning message:', error);
      alert('Không thể bỏ ghim tin nhắn');
    } else {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, is_pinned: false, pinned_at: undefined, pinned_by: undefined } : m
        )
      );
    }
    setMessageMenu(null);
  };

  // Scroll to specific message
  const scrollToMessage = (messageId: number) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.backgroundColor = '#fff3cd';
      setTimeout(() => {
        element.style.backgroundColor = '';
      }, 2000);
    }
  };

  // Reply to message handler
  const handleReplyMessage = (msg: Message) => {
    setReplyingTo(msg);
    setMessageMenu(null);
    inputRef.current?.focus();
  };

  // Cancel reply
  const cancelReply = () => {
    setReplyingTo(null);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setMessageMenu(null);
    if (messageMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [messageMenu]);

  // Upload file handler
  const handleFileUpload = async (file: File, type: 'image' | 'video' | 'file') => {
    if (!conversation || !user) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // Create unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${conversation.id}/${user.id}_${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat-files')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        alert('Không thể tải file lên. Vui lòng thử lại.');
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('chat-files')
        .getPublicUrl(uploadData.path);

      // Save message with file info
      const { data: msgData, error: msgError } = await supabase
        .from('messages')
        .insert([
          {
            conversation_id: conversation.id,
            sender_id: user.id,
            content: file.name,
            message_type: type,
            file_url: urlData.publicUrl,
            file_name: file.name,
            file_size: file.size,
          },
        ])
        .select()
        .single();

      if (msgError) {
        console.error('Message error:', msgError);
      } else if (msgData) {
        setMessages((prev) => {
          if (prev.some(m => m.id === msgData.id)) return prev;
          return [...prev, msgData];
        });
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Đã xảy ra lỗi khi tải file.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // File input change handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'file') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert('File quá lớn! Kích thước tối đa là 50MB.');
      return;
    }

    handleFileUpload(file, type);
    e.target.value = ''; // Reset input
  };

  // Render message content based on type
  const renderMessageContent = (msg: Message) => {
    const isOwn = msg.sender_id === user?.id;

    // If message is deleted, show deleted message for all types
    if (msg.is_deleted) {
      return (
        <>
          <p className="mb-1" style={{ lineHeight: '1.4', fontStyle: 'italic' }}>
            🚫 Tin nhắn đã bị xóa
          </p>
          <small style={{ opacity: 0.7, fontSize: '0.75rem' }}>
            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </small>
        </>
      );
    }

    switch (msg.message_type) {
      case 'image':
        return (
          <div>
            <img
              src={msg.file_url}
              alt={msg.file_name || 'Image'}
              style={{
                maxWidth: '100%',
                maxHeight: '300px',
                borderRadius: '12px',
                cursor: 'pointer',
              }}
              onClick={() => setPreviewImage(msg.file_url || null)}
            />
            <small style={{ opacity: 0.7, fontSize: '0.75rem', display: 'block', marginTop: '4px' }}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
          </div>
        );

      case 'video':
        return (
          <div>
            <video
              src={msg.file_url}
              controls
              style={{
                maxWidth: '100%',
                maxHeight: '300px',
                borderRadius: '12px',
              }}
            />
            <small style={{ opacity: 0.7, fontSize: '0.75rem', display: 'block', marginTop: '4px' }}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
          </div>
        );

      case 'file':
        return (
          <div>
            <a
              href={msg.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="d-flex align-items-center text-decoration-none"
              style={{ color: isOwn ? 'white' : '#333' }}
            >
              <div
                className="me-2 d-flex align-items-center justify-content-center"
                style={{
                  width: '40px',
                  height: '40px',
                  background: isOwn ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)',
                  borderRadius: '8px',
                  fontSize: '1.2rem',
                }}
              >
                📄
              </div>
              <div>
                <div style={{ fontWeight: 500 }}>{msg.file_name}</div>
                <small style={{ opacity: 0.7 }}>{formatFileSize(msg.file_size || 0)}</small>
              </div>
            </a>
            <small style={{ opacity: 0.7, fontSize: '0.75rem', display: 'block', marginTop: '4px' }}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
          </div>
        );

      case 'poll':
        return (
          <div>
            {msg.poll_id ? (
              <PollDisplay pollId={msg.poll_id} />
            ) : (
              <p className="mb-1" style={{ lineHeight: '1.4' }}>{msg.content}</p>
            )}
            <small style={{ opacity: 0.7, fontSize: '0.75rem', display: 'block', marginTop: '4px' }}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
          </div>
        );

      default:
        return (
          <>
            <p className="mb-1" style={{ lineHeight: '1.4' }}>{msg.content}</p>
            <small style={{ opacity: 0.7, fontSize: '0.75rem' }}>
              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
          </>
        );
    }
  };

  // Empty state
  if (!conversation) {
    return (
      <div className="h-100 d-flex align-items-center justify-content-center">
        <div className="text-center p-4">
          <div 
            className="d-inline-flex align-items-center justify-content-center rounded-circle mb-4"
            style={{ 
              width: '120px', 
              height: '120px', 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              fontSize: '3rem'
            }}
          >
            💬
          </div>
          <h3 className="fw-bold text-dark mb-2">Chào mừng đến Mess của T</h3>
          <p className="text-muted mb-0">Chọn một cuộc trò chuyện để bắt đầu nhắn tin</p>
          <p className="text-muted small">hoặc tìm kiếm bạn bè mới</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-100 d-flex flex-column">
      {/* Chat Header */}
      <div 
        className="px-3 py-2 bg-white border-bottom d-flex align-items-center"
        style={{ minHeight: '65px' }}
      >
        {/* Back button for mobile */}
        <Button
          variant="light"
          className="d-md-none me-2 rounded-circle p-2"
          onClick={onBack}
          style={{ width: '40px', height: '40px' }}
        >
          ←
        </Button>

        <div 
          className="rounded-circle d-flex align-items-center justify-content-center me-3"
          style={{ 
            width: '45px', 
            height: '45px', 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            fontWeight: '600',
            fontSize: '1.1rem',
            flexShrink: 0
          }}
        >
          {(conversation.name || 'C')[0].toUpperCase()}
        </div>
        
        <div 
          className="flex-grow-1 min-width-0"
          style={{ cursor: conversation.is_group ? 'pointer' : 'default' }}
          onClick={() => conversation.is_group && setShowGroupSettings(true)}
          title={conversation.is_group ? 'Xem thông tin nhóm' : ''}
        >
          <h6 className="mb-0 fw-bold text-truncate">{conversation.name || 'Chat'}</h6>
          <small className="text-success">
            {conversation.is_group ? '👥 Nhóm • Nhấn để xem thông tin' : '🟢 Đang hoạt động'}
          </small>
        </div>

        {/* Action buttons */}
        <div className="d-flex gap-2">
          <Button
            variant="light"
            className="rounded-circle p-0 d-flex align-items-center justify-content-center"
            style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}
            onClick={() => setShowSearch(true)}
            title="Tìm kiếm tin nhắn"
          >
            🔍
          </Button>
          
          {conversation.is_group && (
            <Button
              variant="light"
              className="rounded-circle p-0 d-flex align-items-center justify-content-center"
              style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}
              onClick={() => setShowGroupSettings(true)}
              title="Thông tin nhóm"
            >
              ℹ️
            </Button>
          )}

          {!conversation.is_group && (
            <>
              <Button
                variant="light"
                className="rounded-circle p-0 d-flex align-items-center justify-content-center"
                style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}
                onClick={() => setShowVideoCall(true)}
                title="Gọi video"
              >
                📹
              </Button>
              <Button
                variant="light"
                className="rounded-circle p-0 d-flex align-items-center justify-content-center"
                style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}
                onClick={() => setShowVideoCall(true)}
                title="Gọi thoại"
              >
                📞
              </Button>
            </>
          )}

          {/* More options dropdown */}
          <Dropdown>
            <Dropdown.Toggle
              variant="light"
              className="rounded-circle p-0 d-flex align-items-center justify-content-center"
              style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}
            >
              ⋮
            </Dropdown.Toggle>
            <Dropdown.Menu align="end">
              {conversation.is_group && (
                <Dropdown.Item onClick={() => setShowGroupSettings(true)}>
                  ℹ️ Thông tin nhóm
                </Dropdown.Item>
              )}
              <Dropdown.Item onClick={() => setShowPoll(true)}>
                📊 Tạo bình chọn
              </Dropdown.Item>
              <Dropdown.Item onClick={() => setShowSearch(true)}>
                🔍 Tìm kiếm tin nhắn
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </div>

      {/* Pinned Messages */}
      <PinnedMessages
        conversationId={conversation.id}
        onScrollToMessage={scrollToMessage}
      />

      {/* Upload Progress */}
      {uploading && (
        <div className="px-3 py-2 bg-light border-bottom">
          <div className="d-flex align-items-center">
            <div className="spinner-border spinner-border-sm me-2" role="status" />
            <span className="small">Đang tải lên... {uploadProgress}%</span>
          </div>
          <ProgressBar now={uploadProgress} className="mt-1" style={{ height: '4px' }} />
        </div>
      )}

      {/* Messages Area */}
      <div 
        ref={messagesContainerRef}
        className="flex-grow-1 overflow-auto p-3"
        style={{ background: '#f8f9fa' }}
      >
        {/* Loading older messages indicator */}
        {loadingOlder && (
          <div className="text-center py-3">
            <div className="spinner-border spinner-border-sm text-primary" role="status" />
            <span className="ms-2 text-muted small">Đang tải tin nhắn cũ...</span>
          </div>
        )}
        
        {/* No more messages indicator */}
        {!hasMoreMessages && messages.length > 0 && (
          <div className="text-center py-2 mb-3">
            <small className="text-muted">📜 Đã hiển thị tất cả tin nhắn</small>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="text-center text-muted py-5">
            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>👋</div>
            <p>Hãy gửi tin nhắn đầu tiên!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_id === user?.id;
            const replyToMsg = msg.reply_to || messages.find(m => m.id === msg.reply_to_id);
            
            return (
              <div
                key={msg.id}
                className={`d-flex mb-3 ${isOwn ? 'justify-content-end' : 'justify-content-start'}`}
              >
                <div
                  style={{
                    maxWidth: msg.message_type === 'image' || msg.message_type === 'video' ? '70%' : '70%',
                    position: 'relative',
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!msg.is_deleted) {
                      setMessageMenu({ msg, x: e.clientX, y: e.clientY });
                    }
                  }}
                >
                  {/* Reply reference */}
                  {replyToMsg && (
                    <div
                      style={{
                        padding: '6px 12px',
                        marginBottom: '4px',
                        borderRadius: '12px',
                        background: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)',
                        fontSize: '0.8rem',
                        borderLeft: '3px solid',
                        borderColor: isOwn ? 'rgba(255,255,255,0.5)' : '#667eea',
                      }}
                    >
                      <div style={{ fontWeight: 600, opacity: 0.8 }}>
                        ↩️ Trả lời
                      </div>
                      <div style={{ opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {replyToMsg.is_deleted ? 'Tin nhắn đã bị xóa' : replyToMsg.content}
                      </div>
                    </div>
                  )}
                  
                  {/* Pinned indicator */}
                  {msg.is_pinned && (
                    <div 
                      className="d-flex align-items-center gap-1 mb-1"
                      style={{ 
                        fontSize: '0.75rem', 
                        color: '#856404',
                        justifyContent: isOwn ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <span>📌</span>
                      <span>Đã ghim</span>
                    </div>
                  )}
                  
                  {/* Message bubble */}
                  <div
                    id={`message-${msg.id}`}
                    style={{
                      padding: msg.message_type === 'image' || msg.message_type === 'video' ? '8px' : '12px 18px',
                      borderRadius: isOwn ? '20px 20px 5px 20px' : '20px 20px 20px 5px',
                      background: msg.is_deleted 
                        ? '#e9ecef'
                        : isOwn 
                          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
                          : 'white',
                      color: msg.is_deleted ? '#6c757d' : (isOwn ? 'white' : '#333'),
                      boxShadow: isOwn 
                        ? '0 3px 10px rgba(102, 126, 234, 0.3)' 
                        : '0 2px 5px rgba(0,0,0,0.05)',
                      wordWrap: 'break-word',
                      fontStyle: msg.is_deleted ? 'italic' : 'normal',
                      transition: 'background-color 0.3s ease',
                      border: msg.is_pinned ? '2px solid #ffc107' : 'none',
                    }}
                  >
                    {renderMessageContent(msg)}
                  </div>
                  
                  {/* Message Reactions */}
                  {!msg.is_deleted && (
                    <MessageReactions
                      messageId={msg.id}
                      reactions={reactions[msg.id] || []}
                      isOwn={isOwn}
                      onReactionsChange={(newReactions) => {
                        setReactions(prev => ({
                          ...prev,
                          [msg.id]: newReactions
                        }));
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Context Menu for Messages */}
      {messageMenu && (
        <div
          className="position-fixed bg-white rounded shadow-lg py-2"
          style={{
            left: messageMenu.x,
            top: messageMenu.y,
            zIndex: 1050,
            minWidth: '150px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="dropdown-item d-flex align-items-center px-3 py-2"
            onClick={() => handleReplyMessage(messageMenu.msg)}
          >
            <span className="me-2">↩️</span> Trả lời
          </button>
          {/* Pin/Unpin button */}
          {!messageMenu.msg.is_deleted && (
            messageMenu.msg.is_pinned ? (
              <button
                className="dropdown-item d-flex align-items-center px-3 py-2"
                onClick={() => handleUnpinMessage(messageMenu.msg.id)}
              >
                <span className="me-2">📌</span> Bỏ ghim
              </button>
            ) : (
              <button
                className="dropdown-item d-flex align-items-center px-3 py-2"
                onClick={() => handlePinMessage(messageMenu.msg.id)}
              >
                <span className="me-2">📌</span> Ghim tin nhắn
              </button>
            )
          )}
          {messageMenu.msg.sender_id === user?.id && !messageMenu.msg.is_deleted && (
            <button
              className="dropdown-item d-flex align-items-center px-3 py-2 text-danger"
              onClick={() => handleDeleteMessage(messageMenu.msg.id)}
            >
              <span className="me-2">🗑️</span> Xóa
            </button>
          )}
        </div>
      )}

      {/* Typing Indicator */}
      {conversation && <TypingIndicator conversationId={conversation.id} />}

      {/* Reply Preview */}
      {replyingTo && (
        <div className="px-3 py-2 bg-light border-top d-flex align-items-center">
          <div className="flex-grow-1">
            <small className="text-primary fw-bold">↩️ Đang trả lời</small>
            <div className="text-truncate small text-muted">
              {replyingTo.is_deleted ? 'Tin nhắn đã bị xóa' : replyingTo.content}
            </div>
          </div>
          <Button
            variant="light"
            size="sm"
            className="rounded-circle p-1"
            onClick={cancelReply}
          >
            ✕
          </Button>
        </div>
      )}

      {/* Message Input */}
      <Form onSubmit={sendMessage} className="p-3 bg-white border-top">
        {/* Hidden file inputs */}
        <input
          type="file"
          ref={imageInputRef}
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFileInputChange(e, 'image')}
        />
        <input
          type="file"
          ref={fileInputRef}
          accept="video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const type = file.type.startsWith('video/') ? 'video' : 'file';
              handleFileInputChange(e, type);
            }
          }}
        />

        <div 
          className="d-flex align-items-center gap-2 p-2 rounded-pill"
          style={{ background: '#f8f9fa' }}
        >
          {/* Attachment buttons */}
          <Button
            variant="light"
            className="rounded-circle p-0 d-flex align-items-center justify-content-center"
            style={{ width: '38px', height: '38px', fontSize: '1.1rem', flexShrink: 0 }}
            onClick={() => imageInputRef.current?.click()}
            disabled={uploading}
            title="Gửi hình ảnh"
          >
            🖼️
          </Button>
          <Button
            variant="light"
            className="rounded-circle p-0 d-flex align-items-center justify-content-center"
            style={{ width: '38px', height: '38px', fontSize: '1.1rem', flexShrink: 0 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Gửi file/video"
          >
            📎
          </Button>

          {/* Emoji Picker */}
          <EmojiPicker
            onSelect={(emoji) => setNewMessage(prev => prev + emoji)}
          />

          <Form.Control
            type="text"
            ref={inputRef}
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping(); // Trigger typing indicator
            }}
            placeholder={replyingTo ? "Nhập tin nhắn trả lời..." : "Nhập tin nhắn..."}
            className="border-0 bg-transparent flex-grow-1"
            style={{ boxShadow: 'none' }}
            disabled={sending || uploading}
          />
          <Button
            type="submit"
            disabled={sending || uploading || !newMessage.trim()}
            className="rounded-circle p-0 d-flex align-items-center justify-content-center"
            style={{ 
              width: '42px', 
              height: '42px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              fontSize: '1.2rem',
              flexShrink: 0
            }}
          >
            {sending ? '⏳' : '➤'}
          </Button>
        </div>
      </Form>

      {/* Image Preview Modal */}
      <Modal show={!!previewImage} onHide={() => setPreviewImage(null)} centered size="lg">
        <Modal.Body className="p-0 bg-dark">
          <img
            src={previewImage || ''}
            alt="Preview"
            style={{ width: '100%', height: 'auto', maxHeight: '80vh', objectFit: 'contain' }}
          />
        </Modal.Body>
        <Modal.Footer className="bg-dark border-0">
          <Button variant="light" onClick={() => setPreviewImage(null)}>Đóng</Button>
          <Button
            variant="primary"
            as="a"
            href={previewImage || ''}
            target="_blank"
            download
          >
            Tải xuống
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Video Call Modals */}
      <VideoCall
        show={showVideoCall}
        onHide={() => setShowVideoCall(false)}
        conversationId={conversation.id}
        conversationName={conversation.name || 'Chat'}
      />

      {incomingCall && (
        <VideoCall
          show={true}
          onHide={() => setIncomingCall(null)}
          conversationId={incomingCall.conversationId}
          conversationName={incomingCall.callerName}
          isIncoming={true}
          callerId={incomingCall.callerId}
          callerName={incomingCall.callerName}
        />
      )}

      {/* Search Messages Modal */}
      <SearchMessages
        show={showSearch}
        onHide={() => setShowSearch(false)}
        conversationId={conversation.id}
        onSelectMessage={(messageId) => {
          setShowSearch(false);
          // Scroll to message
          const element = document.getElementById(`message-${messageId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.style.backgroundColor = '#fff3cd';
            setTimeout(() => {
              element.style.backgroundColor = '';
            }, 2000);
          }
        }}
      />

      {/* Create Poll Modal */}
      <CreatePoll
        show={showPoll}
        onHide={() => setShowPoll(false)}
        conversationId={conversation.id}
        onPollCreated={() => {
          setShowPoll(false);
        }}
      />

      {/* Group Settings Modal */}
      {conversation.is_group && (
        <GroupSettings
          show={showGroupSettings}
          onHide={() => setShowGroupSettings(false)}
          conversation={conversation}
          onUpdate={() => {
            // Refresh conversation info
          }}
        />
      )}
    </div>
  );
};
export default ChatWindow;