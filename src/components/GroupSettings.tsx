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

interface MemberUser {
  id: number;
  username: string;
  is_online?: boolean;
  last_seen?: string;
}

interface Member {
  user_id: number;
  role: string;
  joined_at: string;
  user: MemberUser;
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
    
    // First fetch conversation members
    const { data: membersData, error: membersError } = await supabase
      .from('conversation_members')
      .select('user_id, role, joined_at')
      .eq('conversation_id', conversation.id);

    if (membersError) {
      console.error('Error fetching members:', membersError);
      setLoading(false);
      return;
    }

    if (membersData && membersData.length > 0) {
      // Get all user IDs
      const userIds = membersData.map((m: any) => m.user_id);
      
      // Fetch user details separately
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, username, is_online, last_seen')
        .in('id', userIds);

      if (usersError) {
        console.error('Error fetching users:', usersError);
        setLoading(false);
        return;
      }

      // Combine members with user data
      const membersList: Member[] = membersData.map((member: any) => {
        const userData = usersData?.find((u: any) => u.id === member.user_id);
        return {
          user_id: member.user_id,
          role: member.role || 'member',
          joined_at: member.joined_at,
          user: userData || { id: member.user_id, username: 'Unknown', is_online: false },
        };
      }).filter((m) => m.user);
      
      setMembers(membersList);
      
      // Check if current user is admin (by role or if they are the first member - creator)
      const currentMember = membersList.find((m) => m.user_id === user?.id);
      const isCreator = membersList.length > 0 && membersList[0]?.user_id === user?.id;
      setIsAdmin(currentMember?.role === 'admin' || isCreator);
      
      // If current user is creator but role is not admin, update it
      if (isCreator && currentMember && currentMember.role !== 'admin') {
        await supabase
          .from('conversation_members')
          .update({ role: 'admin' })
          .eq('conversation_id', conversation.id)
          .eq('user_id', user?.id);
      }
    } else {
      setMembers([]);
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
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header 
        closeButton 
        style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
      >
        <Modal.Title className="text-white">
          ℹ️ Thông tin nhóm
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" style={{ color: '#667eea' }} />
          </div>
        ) : (
          <>
            {/* Admin Badge */}
            {isAdmin && (
              <div className="alert alert-info d-flex align-items-center mb-3">
                <span className="me-2">👑</span>
                <span>Bạn là <strong>Quản trị viên</strong> của nhóm này. Bạn có thể sửa tên nhóm, thêm/xóa thành viên.</span>
              </div>
            )}

            {/* Group Name */}
            <Form.Group className="mb-4">
              <Form.Label className="fw-bold">Tên nhóm</Form.Label>
              <div className="d-flex gap-2">
                <Form.Control
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  disabled={!isAdmin}
                  placeholder={isAdmin ? "Nhập tên nhóm..." : ""}
                />
                {isAdmin && (
                  <Button
                    variant="primary"
                    onClick={handleUpdateGroupName}
                    disabled={!groupName.trim()}
                    style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}
                  >
                    💾 Lưu
                  </Button>
                )}
              </div>
              {!isAdmin && (
                <Form.Text className="text-muted">
                  Chỉ quản trị viên mới có thể sửa tên nhóm
                </Form.Text>
              )}
            </Form.Group>

            {/* Members List */}
            <div className="mb-3">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="fw-bold">👥 Thành viên ({members.length})</span>
                {isAdmin && (
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => setShowAddMember(!showAddMember)}
                  >
                    {showAddMember ? '✕ Đóng' : '+ Thêm thành viên'}
                  </Button>
                )}
              </div>

              {/* Add Member Search */}
              {showAddMember && isAdmin && (
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
                        + Thêm
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
                          width: '40px',
                          height: '40px',
                          background: member.role === 'admin' 
                            ? 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
                            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          color: 'white',
                          fontWeight: 'bold',
                        }}
                      >
                        {member.user.username[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="d-flex align-items-center gap-2">
                          <span className="fw-semibold">{member.user.username}</span>
                          {member.role === 'admin' && (
                            <Badge bg="warning" text="dark">👑 Admin</Badge>
                          )}
                          {member.user_id === user?.id && (
                            <Badge bg="info">Bạn</Badge>
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
                      <div className="d-flex gap-2">
                        <Button
                          variant={member.role === 'admin' ? 'warning' : 'outline-warning'}
                          size="sm"
                          onClick={() => handleToggleAdmin(member.user_id, member.role)}
                          title={member.role === 'admin' ? 'Hủy quyền Admin' : 'Cấp quyền Admin'}
                        >
                          👑 {member.role === 'admin' ? 'Hủy Admin' : 'Cấp Admin'}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleRemoveMember(member.user_id)}
                          title="Xóa khỏi nhóm"
                        >
                          🚫 Xóa
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
