import React, { useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../contexts/UserContext';
import { Modal, Form, ListGroup, Spinner } from 'react-bootstrap';
import type { Message } from '../types';
import debounce from 'lodash.debounce';

interface SearchMessagesProps {
  show: boolean;
  onHide: () => void;
  conversationId?: number;
  onSelectMessage?: (message: Message, conversationId: number) => void;
}

interface SearchResult extends Message {
  conversation_name?: string;
  sender_name?: string;
}

const SearchMessages: React.FC<SearchMessagesProps> = ({
  show,
  onHide,
  conversationId,
  onSelectMessage,
}) => {
  const { user } = useUser();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const searchMessages = async (searchQuery: string) => {
    if (!user || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);

    try {
      let queryBuilder = supabase
        .from('messages')
        .select(`
          *,
          conversations!inner (id, name),
          users:sender_id (username)
        `)
        .ilike('content', `%${searchQuery}%`)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50);

      // If searching within a specific conversation
      if (conversationId) {
        queryBuilder = queryBuilder.eq('conversation_id', conversationId);
      } else {
        // Only search in user's conversations
        const { data: memberData } = await supabase
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', user.id);

        if (memberData) {
          const convIds = memberData.map(m => m.conversation_id);
          queryBuilder = queryBuilder.in('conversation_id', convIds);
        }
      }

      const { data, error } = await queryBuilder;

      if (error) {
        console.error('Search error:', error);
        return;
      }

      const searchResults: SearchResult[] = (data || []).map((msg: any) => ({
        ...msg,
        conversation_name: msg.conversations?.name || 'Chat',
        sender_name: msg.users?.username || 'Unknown',
      }));

      setResults(searchResults);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search
  const debouncedSearch = useCallback(
    debounce((q: string) => searchMessages(q), 300),
    [user?.id, conversationId]
  );

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  const highlightMatch = (text: string, search: string) => {
    if (!search) return text;
    const regex = new RegExp(`(${search})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} style={{ background: '#fef08a', padding: 0 }}>
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const handleSelectResult = (result: SearchResult) => {
    onSelectMessage?.(result, result.conversation_id);
    onHide();
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <Modal.Title className="text-white">
          🔍 Tìm kiếm tin nhắn
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Control
          type="text"
          placeholder="Nhập từ khóa tìm kiếm..."
          value={query}
          onChange={handleQueryChange}
          className="mb-3"
          autoFocus
        />

        {loading && (
          <div className="text-center py-4">
            <Spinner animation="border" style={{ color: '#667eea' }} />
          </div>
        )}

        {!loading && query.length >= 2 && results.length === 0 && (
          <div className="text-center py-4 text-muted">
            <div style={{ fontSize: '3rem' }}>🔍</div>
            <p>Không tìm thấy kết quả nào</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <>
            <div className="text-muted small mb-2">
              Tìm thấy {results.length} kết quả
            </div>
            <ListGroup style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {results.map((result) => (
                <ListGroup.Item
                  key={result.id}
                  action
                  onClick={() => handleSelectResult(result)}
                  className="py-3"
                >
                  <div className="d-flex justify-content-between align-items-start mb-1">
                    <small className="text-primary fw-bold">
                      {result.conversation_name}
                    </small>
                    <small className="text-muted">
                      {new Date(result.created_at).toLocaleDateString('vi-VN')}
                    </small>
                  </div>
                  <div className="mb-1">
                    <small className="text-muted">{result.sender_name}: </small>
                    <span>{highlightMatch(result.content, query)}</span>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </>
        )}

        {!loading && query.length < 2 && (
          <div className="text-center py-4 text-muted">
            <div style={{ fontSize: '3rem' }}>💬</div>
            <p>Nhập ít nhất 2 ký tự để tìm kiếm</p>
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default SearchMessages;
