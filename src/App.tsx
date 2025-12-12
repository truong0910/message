import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useUser } from './contexts/UserContext';
import Login from './components/Login';
import Register from './components/Register';
import ForgotPassword from './components/ForgotPassword';
import ChatList from './components/ChatList';
import ChatWindow from './components/ChatWindow';
import type { Conversation } from './types';
import { Navbar, Nav, Button, Container, Dropdown } from 'react-bootstrap';

function App() {
  const { user, logout } = useUser();
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  // Reset conversation when user changes (login/logout)
  useEffect(() => {
    setSelectedConversation(null);
  }, [user?.id]);

  // Hide sidebar on mobile when conversation selected
  useEffect(() => {
    if (selectedConversation && window.innerWidth <= 768) {
      setShowSidebar(false);
    }
  }, [selectedConversation]);

  const handleDeleteConversation = (conversationId: number) => {
    if (selectedConversation?.id === conversationId) {
      setSelectedConversation(null);
      setShowSidebar(true);
    }
  };

  const handleBack = () => {
    setSelectedConversation(null);
    setShowSidebar(true);
  };

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  return (
    <div className="vh-100 d-flex flex-column">
      {/* Header */}
      <Navbar 
        expand="lg" 
        className="shadow-sm px-3"
        style={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          minHeight: '60px'
        }}
      >
        <Container fluid className="px-2">
          <Navbar.Brand className="d-flex align-items-center text-white fw-bold">
            <div 
              className="d-flex align-items-center justify-content-center me-2 rounded-3"
              style={{ 
                width: '38px', 
                height: '38px', 
                background: 'rgba(255,255,255,0.2)'
              }}
            >
              💬
            </div>
            <span className="d-none d-sm-inline">Mess của T</span>
            <span className="d-sm-none">Mess</span>
          </Navbar.Brand>
          
          <Nav className="ms-auto d-flex align-items-center flex-row gap-2">
            <Dropdown align="end">
              <Dropdown.Toggle 
                variant="link" 
                className="text-white text-decoration-none d-flex align-items-center p-1"
                style={{ boxShadow: 'none' }}
              >
                <div 
                  className="d-flex align-items-center justify-content-center rounded-circle me-2"
                  style={{ 
                    width: '35px', 
                    height: '35px', 
                    background: 'rgba(255,255,255,0.2)',
                    fontWeight: '600'
                  }}
                >
                  {user.username[0].toUpperCase()}
                </div>
                <span className="d-none d-md-inline">{user.username}</span>
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Header>👋 Xin chào, {user.username}!</Dropdown.Header>
                <Dropdown.Divider />
                <Dropdown.Item onClick={() => { setSelectedConversation(null); logout(); }}>
                  🚪 Đăng xuất
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown>
          </Nav>
        </Container>
      </Navbar>

      {/* Main Content */}
      <div className="d-flex flex-grow-1 overflow-hidden position-relative">
        {/* Sidebar */}
        <div 
          className={`bg-white border-end d-flex flex-column ${!showSidebar ? 'd-none d-md-flex' : ''}`}
          style={{ 
            width: '350px', 
            minWidth: '300px',
            maxWidth: '100%'
          }}
        >
          <ChatList 
            onSelectConversation={(conv) => {
              setSelectedConversation(conv);
              if (window.innerWidth <= 768) setShowSidebar(false);
            }}
            selectedConversation={selectedConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        </div>

        {/* Chat Area */}
        <div 
          className={`flex-grow-1 d-flex flex-column bg-light ${showSidebar && !selectedConversation ? 'd-none d-md-flex' : ''}`}
          style={{ minWidth: 0 }}
        >
          <ChatWindow 
            conversation={selectedConversation} 
            onBack={handleBack}
          />
        </div>
      </div>
    </div>
  );
}

export default App;