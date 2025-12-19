import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../contexts/UserContext';
import { Modal, Button, Spinner, Badge } from 'react-bootstrap';

interface GroupVideoCallProps {
  show: boolean;
  onHide: () => void;
  conversationId: number;
  conversationName: string;
  isIncoming?: boolean;
  callerId?: number;
  callerName?: string;
}

interface Participant {
  id: number;
  username: string;
  stream?: MediaStream;
  peerConnection?: RTCPeerConnection;
}

const GroupVideoCall: React.FC<GroupVideoCallProps> = ({
  show,
  onHide,
  conversationId,
  conversationName,
  isIncoming = false,
  callerId,
  callerName,
}) => {
  const { user } = useUser();
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'ringing' | 'connected' | 'ended'>('idle');
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [iceServers, setIceServers] = useState<RTCConfiguration>({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  });
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const channelRef = useRef<any>(null);
  const callStartTimeRef = useRef<Date | null>(null);

  // TURN credentials từ Metered
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnPassword = import.meta.env.VITE_TURN_PASSWORD;

  useEffect(() => {
    const iceServersList: RTCIceServer[] = [
      { urls: 'stun:stun.relay.metered.ca:80' },
    ];

    if (turnUsername && turnPassword) {
      iceServersList.push(
        {
          urls: 'turn:global.relay.metered.ca:80',
          username: turnUsername,
          credential: turnPassword,
        },
        {
          urls: 'turn:global.relay.metered.ca:80?transport=tcp',
          username: turnUsername,
          credential: turnPassword,
        },
        {
          urls: 'turn:global.relay.metered.ca:443',
          username: turnUsername,
          credential: turnPassword,
        },
        {
          urls: 'turns:global.relay.metered.ca:443?transport=tcp',
          username: turnUsername,
          credential: turnPassword,
        }
      );
    }

    setIceServers({
      iceServers: iceServersList,
      iceCandidatePoolSize: 10,
    });
  }, [turnUsername, turnPassword]);

  // Get all other users in conversation
  const getGroupMembers = async (): Promise<Participant[]> => {
    const { data: members } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', user?.id);

    if (!members) return [];

    const userIds = members.map(m => m.user_id);
    const { data: users } = await supabase
      .from('users')
      .select('id, username')
      .in('id', userIds);

    return users?.map(u => ({ id: u.id, username: u.username })) || [];
  };

  // Initialize media stream
  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: isVideoEnabled,
        audio: isAudioEnabled,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Không thể truy cập camera/microphone. Vui lòng cấp quyền.');
      return null;
    }
  };

  // Create peer connection for a specific participant
  const createPeerConnection = (targetUserId: number): RTCPeerConnection => {
    const pc = new RTCPeerConnection(iceServers);

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await supabase.from('call_signals').insert({
          conversation_id: conversationId,
          caller_id: user?.id,
          callee_id: targetUserId,
          type: 'ice-candidate',
          signal_data: { candidate: event.candidate, isGroupCall: true },
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('Received remote track from:', targetUserId);
      setParticipants(prev => 
        prev.map(p => 
          p.id === targetUserId 
            ? { ...p, stream: event.streams[0] } 
            : p
        )
      );
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection state with ${targetUserId}:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
        if (!callStartTimeRef.current) {
          callStartTimeRef.current = new Date();
        }
      }
    };

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnectionsRef.current.set(targetUserId, pc);
    return pc;
  };

  // Start group call
  const startGroupCall = async () => {
    setCallStatus('calling');

    const stream = await initializeMedia();
    if (!stream) return;

    const members = await getGroupMembers();
    setParticipants(members);

    // Send call request to all members
    for (const member of members) {
      await supabase.from('call_signals').insert({
        conversation_id: conversationId,
        caller_id: user?.id,
        callee_id: member.id,
        type: 'call-request',
        signal_data: { callerName: user?.username, isGroupCall: true },
      });
    }
  };

  // Accept incoming group call
  const acceptCall = async () => {
    if (!callerId) return;
    setCallStatus('connected');
    callStartTimeRef.current = new Date();

    const stream = await initializeMedia();
    if (!stream) return;

    // Get all participants
    const members = await getGroupMembers();
    setParticipants(members);

    // Create peer connection for caller
    createPeerConnection(callerId);

    // Send acceptance
    await supabase.from('call_signals').insert({
      conversation_id: conversationId,
      caller_id: user?.id,
      callee_id: callerId,
      type: 'call-accepted',
      signal_data: { isGroupCall: true },
    });
  };

  // Reject incoming call
  const rejectCall = async () => {
    if (!callerId) return;
    
    await supabase.from('call_signals').insert({
      conversation_id: conversationId,
      caller_id: user?.id,
      callee_id: callerId,
      type: 'call-rejected',
      signal_data: { isGroupCall: true },
    });
    
    onHide();
  };

  // End call
  const endCall = async () => {
    setCallStatus('ended');

    // Send end signal to all participants
    for (const [participantId] of peerConnectionsRef.current) {
      await supabase.from('call_signals').insert({
        conversation_id: conversationId,
        caller_id: user?.id,
        callee_id: participantId,
        type: 'call-ended',
        signal_data: { isGroupCall: true },
      });
    }

    // Log call to messages
    if (callStartTimeRef.current) {
      const duration = Math.floor((new Date().getTime() - callStartTimeRef.current.getTime()) / 1000);
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      const durationText = minutes > 0 ? `${minutes} phút ${seconds} giây` : `${seconds} giây`;
      
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user?.id,
        content: `📹 Cuộc gọi nhóm - ${durationText}`,
        message_type: 'text',
      });
    }

    // Cleanup
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    setTimeout(() => onHide(), 1000);
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  // Handle incoming signals
  useEffect(() => {
    if (!show || !user) return;

    const channel = supabase
      .channel(`group_call:${conversationId}:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `callee_id=eq.${user.id}`,
        },
        async (payload) => {
          const signal = payload.new as any;
          if (signal.conversation_id !== conversationId) return;
          if (!signal.signal_data?.isGroupCall) return;

          const senderId = signal.caller_id;

          switch (signal.type) {
            case 'call-accepted':
              console.log('Call accepted by:', senderId);
              // Create peer connection and send offer
              const pc = createPeerConnection(senderId);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              
              await supabase.from('call_signals').insert({
                conversation_id: conversationId,
                caller_id: user.id,
                callee_id: senderId,
                type: 'offer',
                signal_data: { sdp: offer, isGroupCall: true },
              });
              break;

            case 'offer':
              console.log('Received offer from:', senderId);
              let peerConn = peerConnectionsRef.current.get(senderId);
              if (!peerConn) {
                peerConn = createPeerConnection(senderId);
              }
              await peerConn.setRemoteDescription(new RTCSessionDescription(signal.signal_data.sdp));
              const answer = await peerConn.createAnswer();
              await peerConn.setLocalDescription(answer);
              
              await supabase.from('call_signals').insert({
                conversation_id: conversationId,
                caller_id: user.id,
                callee_id: senderId,
                type: 'answer',
                signal_data: { sdp: answer, isGroupCall: true },
              });
              break;

            case 'answer':
              console.log('Received answer from:', senderId);
              const answerPc = peerConnectionsRef.current.get(senderId);
              if (answerPc) {
                await answerPc.setRemoteDescription(new RTCSessionDescription(signal.signal_data.sdp));
              }
              break;

            case 'ice-candidate':
              console.log('Received ICE candidate from:', senderId);
              const icePc = peerConnectionsRef.current.get(senderId);
              if (icePc && signal.signal_data.candidate) {
                await icePc.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
              }
              break;

            case 'call-ended':
              console.log('Call ended by:', senderId);
              const endedPc = peerConnectionsRef.current.get(senderId);
              if (endedPc) {
                endedPc.close();
                peerConnectionsRef.current.delete(senderId);
              }
              setParticipants(prev => prev.filter(p => p.id !== senderId));
              
              // If no more participants, end call
              if (peerConnectionsRef.current.size === 0) {
                endCall();
              }
              break;
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [show, user, conversationId, iceServers]);

  // Auto-start call for outgoing
  useEffect(() => {
    if (show && !isIncoming && callStatus === 'idle') {
      startGroupCall();
    }
  }, [show, isIncoming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      peerConnectionsRef.current.forEach((pc) => pc.close());
    };
  }, []);

  const connectedParticipants = participants.filter(p => p.stream);

  return (
    <Modal
      show={show}
      onHide={() => endCall()}
      centered
      size="xl"
      backdrop="static"
      className="video-call-modal"
    >
      <Modal.Header style={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' }}>
        <Modal.Title className="text-white d-flex align-items-center gap-2">
          📹 Cuộc gọi nhóm - {conversationName}
          <Badge bg="light" text="dark">
            {connectedParticipants.length + 1} người
          </Badge>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark p-2">
        {/* Incoming Call UI */}
        {isIncoming && callStatus === 'idle' && (
          <div className="text-center py-5">
            <div className="mb-4">
              <div
                className="rounded-circle mx-auto d-flex align-items-center justify-content-center mb-3"
                style={{
                  width: '100px',
                  height: '100px',
                  background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                  fontSize: '2.5rem',
                }}
              >
                📹
              </div>
              <h4 className="text-white">{callerName || 'Ai đó'}</h4>
              <p className="text-white-50">đang gọi nhóm...</p>
            </div>
            <div className="d-flex justify-content-center gap-4">
              <Button
                variant="danger"
                className="rounded-circle p-3"
                style={{ width: '70px', height: '70px', fontSize: '1.5rem' }}
                onClick={rejectCall}
              >
                ✕
              </Button>
              <Button
                variant="success"
                className="rounded-circle p-3"
                style={{ width: '70px', height: '70px', fontSize: '1.5rem' }}
                onClick={acceptCall}
              >
                📞
              </Button>
            </div>
          </div>
        )}

        {/* Calling UI */}
        {callStatus === 'calling' && (
          <div className="text-center py-5">
            <Spinner animation="border" variant="success" className="mb-3" />
            <h5 className="text-white">Đang gọi nhóm {conversationName}...</h5>
            <p className="text-white-50">{participants.length} thành viên</p>
            <Button variant="danger" onClick={() => endCall()} className="mt-3">
              Hủy cuộc gọi
            </Button>
          </div>
        )}

        {/* Connected Call UI */}
        {(callStatus === 'connected' || (callStatus !== 'idle' && callStatus !== 'calling' && callStatus !== 'ended')) && (
          <>
            {/* Video Grid */}
            <div 
              className="d-flex flex-wrap justify-content-center gap-2 mb-3"
              style={{ minHeight: '400px' }}
            >
              {/* Local Video */}
              <div 
                className="position-relative rounded overflow-hidden"
                style={{ 
                  width: connectedParticipants.length >= 2 ? '48%' : '100%',
                  maxWidth: '500px',
                  aspectRatio: '4/3',
                  background: '#1a1a1a'
                }}
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-100 h-100"
                  style={{ objectFit: 'cover', transform: 'scaleX(-1)' }}
                />
                <div 
                  className="position-absolute bottom-0 start-0 m-2 px-2 py-1 rounded"
                  style={{ background: 'rgba(0,0,0,0.6)' }}
                >
                  <small className="text-white">Bạn</small>
                </div>
                {!isVideoEnabled && (
                  <div className="position-absolute top-50 start-50 translate-middle">
                    <div 
                      className="rounded-circle d-flex align-items-center justify-content-center"
                      style={{ 
                        width: '80px', 
                        height: '80px', 
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        fontSize: '2rem'
                      }}
                    >
                      {user?.username?.[0]?.toUpperCase() || '?'}
                    </div>
                  </div>
                )}
              </div>

              {/* Remote Videos */}
              {participants.map((participant) => (
                <div 
                  key={participant.id}
                  className="position-relative rounded overflow-hidden"
                  style={{ 
                    width: connectedParticipants.length >= 2 ? '48%' : '100%',
                    maxWidth: '500px',
                    aspectRatio: '4/3',
                    background: '#1a1a1a'
                  }}
                >
                  {participant.stream ? (
                    <video
                      autoPlay
                      playsInline
                      className="w-100 h-100"
                      style={{ objectFit: 'cover' }}
                      ref={(el) => {
                        if (el && participant.stream) {
                          el.srcObject = participant.stream;
                        }
                      }}
                    />
                  ) : (
                    <div className="w-100 h-100 d-flex align-items-center justify-content-center">
                      <div className="text-center">
                        <div 
                          className="rounded-circle mx-auto d-flex align-items-center justify-content-center mb-2"
                          style={{ 
                            width: '60px', 
                            height: '60px', 
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            fontSize: '1.5rem',
                            color: 'white'
                          }}
                        >
                          {participant.username[0].toUpperCase()}
                        </div>
                        <small className="text-white-50">Đang kết nối...</small>
                      </div>
                    </div>
                  )}
                  <div 
                    className="position-absolute bottom-0 start-0 m-2 px-2 py-1 rounded"
                    style={{ background: 'rgba(0,0,0,0.6)' }}
                  >
                    <small className="text-white">{participant.username}</small>
                  </div>
                </div>
              ))}
            </div>

            {/* Controls */}
            <div className="d-flex justify-content-center gap-3 py-3">
              <Button
                variant={isVideoEnabled ? 'light' : 'danger'}
                className="rounded-circle p-0"
                style={{ width: '55px', height: '55px', fontSize: '1.3rem' }}
                onClick={toggleVideo}
                title={isVideoEnabled ? 'Tắt camera' : 'Bật camera'}
              >
                {isVideoEnabled ? '📹' : '🚫'}
              </Button>
              <Button
                variant={isAudioEnabled ? 'light' : 'danger'}
                className="rounded-circle p-0"
                style={{ width: '55px', height: '55px', fontSize: '1.3rem' }}
                onClick={toggleAudio}
                title={isAudioEnabled ? 'Tắt mic' : 'Bật mic'}
              >
                {isAudioEnabled ? '🎤' : '🔇'}
              </Button>
              <Button
                variant="danger"
                className="rounded-circle p-0"
                style={{ width: '55px', height: '55px', fontSize: '1.3rem' }}
                onClick={() => endCall()}
                title="Kết thúc cuộc gọi"
              >
                📴
              </Button>
            </div>
          </>
        )}

        {/* Call Ended UI */}
        {callStatus === 'ended' && (
          <div className="text-center py-5">
            <h5 className="text-white">Cuộc gọi đã kết thúc</h5>
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default GroupVideoCall;
