import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../contexts/UserContext';
import type { User, Conversation } from '../types';
import { Modal, Form, Button, ListGroup, Spinner, Badge, Alert } from 'react-bootstrap';

interface CreateGroupProps {
  show: boolean;
  onHide: () => void;
  onGroupCreated: (conversation: Conversation) => void;
}

const CreateGroup: React.FC<CreateGroupProps> = ({ show, onHide, onGroupCreated }) => {
  const { user } = useUser();
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    const { data, error: searchError } = await supabase
      .from('users')
      .select('*')
      .ilike('username', `%${query}%`)
      .neq('id', user?.id)
      .limit(10);

    if (searchError) {
      console.error('Search error:', searchError);
    } else {
      // Filter out already selected members
      const filteredResults = (data || []).filter(
        (u) => !selectedMembers.some((m) => m.id === u.id)
      );
      setSearchResults(filteredResults);
    }
    setLoading(false);
  };

  const addMember = (member: User) => {
    setSelectedMembers((prev) => [...prev, member]);
    setSearchResults((prev) => prev.filter((u) => u.id !== member.id));
    setSearchQuery('');
  };

  const removeMember = (memberId: number) => {
    setSelectedMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const handleCreateGroup = async () => {
    if (!user || !groupName.trim()) {
      setError('Vui lòng nhập tên nhóm');
      return;
    }

    if (selectedMembers.length < 1) {
      setError('Vui lòng thêm ít nhất 1 thành viên');
      return;
    }

    setCreating(true);
    setError('');

    try {
      // Create the group conversation
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert([{ 
          name: groupName.trim(), 
          is_group: true,
          created_by: user.id
        }])
        .select()
        .single();

      if (convError) throw convError;

      // Add creator as admin
      const memberInserts = [
        { 
          conversation_id: newConv.id, 
          user_id: user.id, 
          role: 'admin',
          added_by: user.id
        },
        ...selectedMembers.map((m) => ({
          conversation_id: newConv.id,
          user_id: m.id,
          role: 'member',
          added_by: user.id
        }))
      ];

      const { error: memberError } = await supabase
        .from('conversation_members')
        .insert(memberInserts);

      if (memberError) throw memberError;

      // Send system message about group creation
      await supabase
        .from('messages')
        .insert([{
          conversation_id: newConv.id,
          sender_id: user.id,
          content: `📢 ${user.username} đã tạo nhóm "${groupName.trim()}"`,
          message_type: 'text'
        }]);

      onGroupCreated(newConv);
      handleClose();
    } catch (err) {
      console.error('Error creating group:', err);
      setError('Không thể tạo nhóm. Vui lòng thử lại.');
    }

    setCreating(false);
  };

  const handleClose = () => {
    setGroupName('');
    setSearchQuery('');
    setSearchResults([]);
    setSelectedMembers([]);
    setError('');
    onHide();
  };

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header 
        closeButton 
        style={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' }}
      >
        <Modal.Title className="text-white">
          👥 Tạo nhóm mới
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}

        {/* Group Name */}
        <Form.Group className="mb-3">
          <Form.Label className="fw-bold">Tên nhóm *</Form.Label>
          <Form.Control
            type="text"
            placeholder="Nhập tên nhóm..."
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            maxLength={50}
          />
        </Form.Group>

        {/* Selected Members */}
        {selectedMembers.length > 0 && (
          <div className="mb-3">
            <Form.Label className="fw-bold">
              Thành viên đã chọn ({selectedMembers.length})
            </Form.Label>
            <div className="d-flex flex-wrap gap-2">
              {selectedMembers.map((member) => (
                <Badge
                  key={member.id}
                  bg="primary"
                  className="d-flex align-items-center gap-1 py-2 px-3"
                  style={{ fontSize: '0.9rem' }}
                >
                  {member.username}
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 ms-1 text-white"
                    onClick={() => removeMember(member.id)}
                    style={{ textDecoration: 'none', fontSize: '1rem' }}
                  >
                    ×
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Search Users */}
        <Form.Group className="mb-3">
          <Form.Label className="fw-bold">Thêm thành viên</Form.Label>
          <Form.Control
            type="text"
            placeholder="Tìm kiếm người dùng..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </Form.Group>

        {/* Search Results */}
        {loading ? (
          <div className="text-center py-3">
            <Spinner animation="border" size="sm" />
          </div>
        ) : searchResults.length > 0 ? (
          <ListGroup className="mb-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {searchResults.map((foundUser) => (
              <ListGroup.Item
                key={foundUser.id}
                action
                onClick={() => addMember(foundUser)}
                className="d-flex align-items-center"
              >
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center me-3"
                  style={{
                    width: '36px',
                    height: '36px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    fontWeight: 'bold',
                  }}
                >
                  {foundUser.username[0].toUpperCase()}
                </div>
                <span>{foundUser.username}</span>
                <Badge bg="success" className="ms-auto">+ Thêm</Badge>
              </ListGroup.Item>
            ))}
          </ListGroup>
        ) : searchQuery.length >= 2 ? (
          <p className="text-muted text-center small">Không tìm thấy người dùng</p>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Hủy
        </Button>
        <Button
          onClick={handleCreateGroup}
          disabled={creating || !groupName.trim() || selectedMembers.length < 1}
          style={{
            background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
            border: 'none'
          }}
        >
          {creating ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Đang tạo...
            </>
          ) : (
            '✓ Tạo nhóm'
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default CreateGroup;
