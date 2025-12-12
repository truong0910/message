import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';

const ForgotPassword: React.FC = () => {
  const [step, setStep] = useState<'username' | 'reset'>('username');
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userId, setUserId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCheckUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: fetchError } = await supabase
        .from('users')
        .select('id, username')
        .eq('username', username)
        .single();

      if (fetchError || !data) {
        setError('Không tìm thấy tài khoản với username này');
      } else {
        setUserId(data.id);
        setStep('reset');
      }
    } catch (err) {
      setError('Đã xảy ra lỗi, vui lòng thử lại');
    }

    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 4) {
      setError('Mật khẩu phải có ít nhất 4 ký tự');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: newPassword })
        .eq('id', userId);

      if (updateError) {
        setError('Không thể cập nhật mật khẩu');
      } else {
        setSuccess('Đặt lại mật khẩu thành công! Đang chuyển đến trang đăng nhập...');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      }
    } catch (err) {
      setError('Đã xảy ra lỗi, vui lòng thử lại');
    }

    setLoading(false);
  };

  const inputStyle = {
    padding: '12px 15px',
    borderRadius: '10px',
    border: '1px solid #e0e0e0',
    transition: 'border-color 0.3s, box-shadow 0.3s'
  };

  const buttonStyle = {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    padding: '12px',
    borderRadius: '10px',
    fontWeight: '600' as const,
    fontSize: '1rem',
    transition: 'transform 0.2s, box-shadow 0.2s'
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">🔐</div>
          <h1 className="auth-logo-text">Mess của T</h1>
          <p style={{ color: '#666', marginTop: '0.5rem' }}>Khôi phục mật khẩu</p>
        </div>

        {step === 'username' ? (
          <Form onSubmit={handleCheckUsername}>
            <p className="text-center mb-4" style={{ color: '#666' }}>
              Nhập tên đăng nhập của bạn để đặt lại mật khẩu
            </p>
            
            <Form.Group className="mb-3">
              <Form.Label style={{ color: '#555', fontWeight: '500' }}>Tên đăng nhập</Form.Label>
              <Form.Control
                type="text"
                placeholder="Nhập tên đăng nhập"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={inputStyle}
              />
            </Form.Group>

            {error && (
              <Alert variant="danger" style={{ borderRadius: '10px', fontSize: '0.9rem' }}>
                {error}
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-100"
              disabled={loading}
              style={buttonStyle}
            >
              {loading ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  Đang kiểm tra...
                </>
              ) : (
                'Tiếp tục'
              )}
            </Button>
          </Form>
        ) : (
          <Form onSubmit={handleResetPassword}>
            <div 
              className="text-center mb-4 p-3" 
              style={{ 
                background: 'rgba(102, 126, 234, 0.1)', 
                borderRadius: '10px' 
              }}
            >
              <small style={{ color: '#666' }}>Đặt mật khẩu mới cho</small>
              <div style={{ fontWeight: '600', color: '#667eea' }}>{username}</div>
            </div>

            <Form.Group className="mb-3">
              <Form.Label style={{ color: '#555', fontWeight: '500' }}>Mật khẩu mới</Form.Label>
              <Form.Control
                type="password"
                placeholder="Nhập mật khẩu mới"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={inputStyle}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label style={{ color: '#555', fontWeight: '500' }}>Xác nhận mật khẩu</Form.Label>
              <Form.Control
                type="password"
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={inputStyle}
              />
            </Form.Group>

            {error && (
              <Alert variant="danger" style={{ borderRadius: '10px', fontSize: '0.9rem' }}>
                {error}
              </Alert>
            )}
            {success && (
              <Alert variant="success" style={{ borderRadius: '10px', fontSize: '0.9rem' }}>
                ✅ {success}
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-100 mb-2"
              disabled={loading || !!success}
              style={buttonStyle}
            >
              {loading ? (
                <>
                  <Spinner size="sm" className="me-2" />
                  Đang xử lý...
                </>
              ) : (
                'Đặt lại mật khẩu'
              )}
            </Button>

            <Button 
              variant="outline-secondary" 
              className="w-100"
              onClick={() => {
                setStep('username');
                setError('');
                setNewPassword('');
                setConfirmPassword('');
              }}
              disabled={loading || !!success}
              style={{
                borderRadius: '10px',
                padding: '12px'
              }}
            >
              ← Quay lại
            </Button>
          </Form>
        )}

        <hr style={{ margin: '1.5rem 0', borderColor: '#e0e0e0' }} />

        <div className="text-center">
          <Link 
            to="/login" 
            style={{ 
              color: '#667eea', 
              textDecoration: 'none',
              fontWeight: '500'
            }}
          >
            ← Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
