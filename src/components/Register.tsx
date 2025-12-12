import React, { useState } from 'react';
import { useUser } from '../contexts/UserContext';
import { useNavigate, Link } from 'react-router-dom';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';

const Register: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useUser();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }

    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }

    setLoading(true);
    try {
      await register(username, password);
      navigate('/chat');
    } catch (err) {
      setError('Đăng ký thất bại. Tên đăng nhập có thể đã tồn tại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">💬</div>
          <h1 className="auth-logo-text">Mess của T</h1>
          <p style={{ color: '#666', marginTop: '0.5rem' }}>Tạo tài khoản mới</p>
        </div>

        {/* Form */}
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label style={{ color: '#555', fontWeight: '500' }}>Tên đăng nhập</Form.Label>
            <Form.Control
              type="text"
              placeholder="Nhập tên đăng nhập"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{
                padding: '12px 15px',
                borderRadius: '10px',
                border: '1px solid #e0e0e0',
                transition: 'border-color 0.3s, box-shadow 0.3s'
              }}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label style={{ color: '#555', fontWeight: '500' }}>Mật khẩu</Form.Label>
            <Form.Control
              type="password"
              placeholder="Nhập mật khẩu (ít nhất 6 ký tự)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                padding: '12px 15px',
                borderRadius: '10px',
                border: '1px solid #e0e0e0',
                transition: 'border-color 0.3s, box-shadow 0.3s'
              }}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label style={{ color: '#555', fontWeight: '500' }}>Xác nhận mật khẩu</Form.Label>
            <Form.Control
              type="password"
              placeholder="Nhập lại mật khẩu"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={{
                padding: '12px 15px',
                borderRadius: '10px',
                border: '1px solid #e0e0e0',
                transition: 'border-color 0.3s, box-shadow 0.3s'
              }}
            />
          </Form.Group>

          {error && (
            <Alert variant="danger" style={{ borderRadius: '10px', fontSize: '0.9rem' }}>
              {error}
            </Alert>
          )}

          <Button 
            type="submit" 
            className="w-100 mb-3"
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              padding: '12px',
              borderRadius: '10px',
              fontWeight: '600',
              fontSize: '1rem',
              transition: 'transform 0.2s, box-shadow 0.2s'
            }}
          >
            {loading ? (
              <>
                <Spinner size="sm" className="me-2" />
                Đang đăng ký...
              </>
            ) : (
              'Đăng ký'
            )}
          </Button>
        </Form>

        <hr style={{ margin: '1.5rem 0', borderColor: '#e0e0e0' }} />

        <div className="text-center">
          <span style={{ color: '#666' }}>Đã có tài khoản? </span>
          <Link 
            to="/login" 
            style={{ 
              color: '#667eea', 
              textDecoration: 'none',
              fontWeight: '600'
            }}
          >
            Đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;