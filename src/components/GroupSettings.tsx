import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../contexts/UserContext';
import { Modal, Form, Button, ListGroup, Badge, Spinner } from 'react-bootstrap';
import type { User, Conversation } from '../types';
import { OnlineStatusBadge } from './OnlineStatus';

interface GroupSettingsProps {
  show: boolean;
  onHide: () => void;
  conversation: Conversation;
  onUpdate?: () => void;
}

interface Member {
  user_id: number;
  role: string;
  joined_at: string;
  user: User;
}

const GroupSettings: React.FC<GroupSettingsProps> = ({
  show,
  onHide,
  conversation,
  onUpdate,
}) => {
  const { user } = useUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState(conversation.name || '');
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  useEffect(() => {
    if (show) {
      fetchMembers();
    }
  }, [show, conversation.id]);

  const fetchMembers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('conversation_members')
      .select(`
        user_id,
        role,
        joined_at,
        users (
          id,
          username,
          is_online,
          last_seen
        )
      `)
      .eq('conversation_id', conversation.id);

    if (data) {
      const membersList = data.map((item: any) => ({
        user_id: item.user_id,
        role: item.role || 'member',
        joined_at: item.joined_at,
        user: item.users,
      }));
      setMembers(membersList);
      
      // Check if current user is admin
      const currentMember = membersList.find(m => m.user_id === user?.id);
      setIsAdmin(currentMember?.role === 'admin');
    }
    setLoading(false);
  };

  const handleUpdateGroupName = async () => {
    if (!groupName.trim() || !isAdmin) return;

    const { error } = await supabase
      .from('conversations')
      .update({ name: groupName })
      .eq('id', conversation.id);

    if (!error) {
      onUpdate?.();
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!isAdmin || memberId === user?.id) return;
    
    if (!window.confirm('Bạn có chắc muốn xóa thành viên này?')) return;

    const { error } = await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversation.id)
      .eq('user_id', memberId);

    if (!error) {
      setMembers(prev => prev.filter(m => m.user_id !== memberId));
    }
  };

  const handleToggleAdmin = async (memberId: number, currentRole: string) => {
    if (!isAdmin || memberId === user?.id) return;

    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    const { error } = await supabase
      .from('conversation_members')
      .update({ role: newRole })
      .eq('conversation_id', conversation.id)
      .eq('user_id', memberId);

    if (!error) {
      setMembers(prev =>
        prev.map(m =>
          m.user_id === memberId ? { ...m, role: newRole } : m
        )
      );
    }
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    const { data } = await supabase
      .from('users')
      .select('*')
      .ilike('username', `%${query}%`)
      .not('id', 'in', `(${members.map(m => m.user_id).join(',')})`)
      .limit(10);

    setSearchResults(data || []);
    setSearching(false);
  };

  const handleAddMember = async (newUser: User) => {
    const { error } = await supabase
      .from('conversation_members')
      .insert({
        conversation_id: conversation.id,
        user_id: newUser.id,
        role: 'member',
        added_by: user?.id,
      });

    if (!error) {
      setMembers(prev => [
        ...prev,
        {
          user_id: newUser.id,
          role: 'member',
          joined_at: new Date().toISOString(),
          user: newUser,
        },
      ]);
      setSearchQuery('');
      setSearchResults([]);
      setShowAddMember(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm('Bạn có chắc muốn rời khỏi nhóm này?')) return;

    const { error } = await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversation.id)
      .eq('user_id', user?.id);

    if (!error) {
      onHide();
      onUpdate?.();
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header 
        closeButton 
        style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
      >
        <Modal.Title className="text-white">
          ⚙️ Cài đặt nhóm
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" style={{ color: '#667eea' }} />
          </div>
        ) : (
          <>
            {/* Group Name */}
            <Form.Group className="mb-4">
              <Form.Label className="fw-bold">Tên nhóm</Form.Label>
              <div className="d-flex gap-2">
                <Form.Control
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  disabled={!isAdmin}
                />
                {isAdmin && (
                  <Button
                    variant="primary"
                    onClick={handleUpdateGroupName}
                    style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}
                  >
                    Lưu
                  </Button>
                )}
              </div>
            </Form.Group>

            {/* Members List */}
            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="fw-bold">Thành viên ({members.length})</span>
                {isAdmin && (
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => setShowAddMember(!showAddMember)}
                  >
                    + Thêm
                  </Button>
                )}
              </div>

              {/* Add Member Search */}
              {showAddMember && (
                <div className="mb-3 p-3 bg-light rounded">
                  <Form.Control
                    type="text"
                    placeholder="Tìm kiếm người dùng..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      searchUsers(e.target.value);
                    }}
                    className="mb-2"
                  />
                  {searching && <Spinner animation="border" size="sm" />}
                  {searchResults.map((u) => (
                    <div
                      key={u.id}
                      className="d-flex justify-content-between align-items-center p-2 bg-white rounded mb-1"
                    >
                      <span>{u.username}</span>
                      <Button
                        size="sm"
                        variant="success"
                        onClick={() => handleAddMember(u)}
                      >
                        Thêm
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <ListGroup>
                {members.map((member) => (
                  <ListGroup.Item
                    key={member.user_id}
                    className="d-flex justify-content-between align-items-center"
                  >
                    <div className="d-flex align-items-center gap-2">
                      <div
                        className="rounded-circle d-flex align-items-center justify-content-center"
                        style={{
                          width: '36px',
                          height: '36px',
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          color: 'white',
                          fontWeight: 'bold',
                        }}
                      >
                        {member.user.username[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="d-flex align-items-center gap-2">
                          <span>{member.user.username}</span>
                          {member.role === 'admin' && (
                            <Badge bg="warning" text="dark">Admin</Badge>
                          )}
                          {member.user_id === user?.id && (
                            <Badge bg="secondary">Bạn</Badge>
                          )}
                        </div>
                        <OnlineStatusBadge
                          isOnline={member.user.is_online}
                          lastSeen={member.user.last_seen}
                          size="sm"
                          showText
                        />
                      </div>
                    </div>
                    
                    {isAdmin && member.user_id !== user?.id && (
                      <div className="d-flex gap-1">
                        <Button
                          variant="outline-warning"
                          size="sm"
                          onClick={() => handleToggleAdmin(member.user_id, member.role)}
                          title={member.role === 'admin' ? 'Hủy Admin' : 'Cấp Admin'}
                        >
                          👑
                        </Button>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleRemoveMember(member.user_id)}
                          title="Xóa thành viên"
                        >
                          🗑️
                        </Button>
                      </div>
                    )}
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </div>

            {/* Leave Group */}
            <Button
              variant="outline-danger"
              className="w-100"
              onClick={handleLeaveGroup}
            >
              🚪 Rời khỏi nhóm
            </Button>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default GroupSettings;
