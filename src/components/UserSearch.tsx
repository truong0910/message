import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../contexts/UserContext';
import type { User, Conversation } from '../types';
import { Modal, Form, Button, ListGroup, Spinner, Alert } from 'react-bootstrap';

interface UserSearchProps {
  show: boolean;
  onHide: () => void;
  onConversationCreated: (conversation: Conversation) => void;
}

const UserSearch: React.FC<UserSearchProps> = ({ show, onHide, onConversationCreated }) => {
  const { user } = useUser();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError('');

    const { data, error: searchError } = await supabase
      .from('users')
      .select('*')
      .ilike('username', `%${searchQuery}%`)
      .neq('id', user?.id)
      .limit(10);

    if (searchError) {
      setError('Error searching users');
      console.error('Search error:', searchError);
    } else {
      setSearchResults(data || []);
    }

    setLoading(false);
  };

  const startConversation = async (selectedUser: User) => {
    if (!user) return;

    setCreating(true);
    setError('');

    try {
      // Check if conversation already exists between these two users
      const { data: existingConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);

      const myConvIds = existingConvs?.map(c => c.conversation_id) || [];

      if (myConvIds.length > 0) {
        const { data: sharedConvs } = await supabase
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
          .eq('user_id', selectedUser.id)
          .in('conversation_id', myConvIds);

        // Find direct (non-group) conversation
        const existingDirect = sharedConvs?.find(
          (c: any) => c.conversations && !c.conversations.is_group
        );

        if (existingDirect && existingDirect.conversations) {
          const conv = existingDirect.conversations as unknown as Conversation;
          onConversationCreated(conv);
          handleClose();
          return;
        }
      }

      // Create new conversation
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert([{ name: selectedUser.username, is_group: false }])
        .select()
        .single();

      if (convError) throw convError;

      // Add both users to conversation
      const { error: memberError } = await supabase
        .from('conversation_members')
        .insert([
          { conversation_id: newConv.id, user_id: user.id },
          { conversation_id: newConv.id, user_id: selectedUser.id }
        ]);

      if (memberError) throw memberError;

      onConversationCreated(newConv);
      handleClose();

    } catch (err) {
      console.error('Error creating conversation:', err);
      setError('Error creating conversation');
    }

    setCreating(false);
  };

  const handleClose = () => {
    setSearchQuery('');
    setSearchResults([]);
    setError('');
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Find Users</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSearch} className="mb-3">
          <div className="d-flex">
            <Form.Control
              type="text"
              placeholder="Search by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="me-2"
            />
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? <Spinner animation="border" size="sm" /> : 'Search'}
            </Button>
          </div>
        </Form>

        {error && <Alert variant="danger">{error}</Alert>}

        {searchResults.length > 0 ? (
          <ListGroup>
            {searchResults.map((foundUser) => (
              <ListGroup.Item
                key={foundUser.id}
                className="d-flex justify-content-between align-items-center"
              >
                <div className="d-flex align-items-center">
                  <div
                    className="bg-primary rounded-circle d-flex align-items-center justify-content-center me-3"
                    style={{ width: '2.5rem', height: '2.5rem' }}
                  >
                    <span className="text-white fw-bold">
                      {foundUser.username[0].toUpperCase()}
                    </span>
                  </div>
                  <span>{foundUser.username}</span>
                </div>
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => startConversation(foundUser)}
                  disabled={creating}
                >
                  {creating ? '...' : 'Message'}
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        ) : searchQuery && !loading ? (
          <p className="text-muted text-center">No users found</p>
        ) : null}
      </Modal.Body>
    </Modal>
  );
};

export default UserSearch;
