import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../contexts/UserContext';
import { Modal, Button, Spinner } from 'react-bootstrap';

interface VideoCallProps {
  show: boolean;
  onHide: () => void;
  conversationId: number;
  conversationName: string;
  isIncoming?: boolean;
  callerId?: number;
  callerName?: string;
}

interface CallSignal {
  id: number;
  conversation_id: number;
  caller_id: number;
  callee_id: number;
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accepted' | 'call-rejected' | 'call-ended';
  signal_data: any;
  created_at: string;
}

const VideoCall: React.FC<VideoCallProps> = ({
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
  const [remoteUserId, setRemoteUserId] = useState<number | null>(null);
  const [iceServers, setIceServers] = useState<RTCConfiguration>({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  });
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<any>(null);
  const remoteUserIdRef = useRef<number | null>(null);

  // TURN credentials từ Metered
  const turnUsername = import.meta.env.VITE_TURN_USERNAME;
  const turnPassword = import.meta.env.VITE_TURN_PASSWORD;

  useEffect(() => {
    // ICE servers theo đúng cấu hình Metered
    const iceServersList: RTCIceServer[] = [
      { urls: 'stun:stun.relay.metered.ca:80' },
    ];

    // Thêm TURN servers nếu có credentials
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
      console.log('TURN servers configured with Metered credentials');
    } else {
      console.log('Using STUN only (no TURN credentials)');
    }

    setIceServers({
      iceServers: iceServersList,
      iceCandidatePoolSize: 10,
    });
  }, [turnUsername, turnPassword]);

  // Get other user in conversation
  const getOtherUserId = async () => {
    const { data } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', user?.id)
      .single();
    return data?.user_id;
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

  // Create peer connection
  const createPeerConnection = (targetUserId?: number) => {
    const pc = new RTCPeerConnection(iceServers);
    const targetId = targetUserId || remoteUserId;

    pc.onicecandidate = async (event) => {
      console.log('ICE candidate:', event.candidate);
      if (event.candidate && targetId) {
        await supabase.from('call_signals').insert({
          conversation_id: conversationId,
          caller_id: user?.id,
          callee_id: targetId,
          type: 'ice-candidate',
          signal_data: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('Received remote track:', event.streams[0]);
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall();
      }
    };

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnectionRef.current = pc;
    return pc;
  };

  // Start outgoing call
  const startCall = async () => {
    const otherUserId = await getOtherUserId();
    if (!otherUserId) {
      alert('Không tìm thấy người dùng để gọi');
      return;
    }
    setRemoteUserId(otherUserId);
    remoteUserIdRef.current = otherUserId;
    setCallStatus('calling');

    const stream = await initializeMedia();
    if (!stream) return;

    // Send call request
    await supabase.from('call_signals').insert({
      conversation_id: conversationId,
      caller_id: user?.id,
      callee_id: otherUserId,
      type: 'call-request',
      signal_data: { callerName: user?.username },
    });
  };

  // Accept incoming call
  const acceptCall = async () => {
    if (!callerId) return;
    setRemoteUserId(callerId);
    remoteUserIdRef.current = callerId;
    setCallStatus('connected');

    const stream = await initializeMedia();
    if (!stream) return;

    // Tạo peer connection trước với callerId
    createPeerConnection(callerId);

    // Send acceptance - người gọi sẽ gửi offer
    await supabase.from('call_signals').insert({
      conversation_id: conversationId,
      caller_id: user?.id,
      callee_id: callerId,
      type: 'call-accepted',
      signal_data: {},
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
      signal_data: {},
    });
    
    onHide();
  };

  // End call
  const endCall = async () => {
    setCallStatus('ended');

    // Send end signal
    if (remoteUserId) {
      await supabase.from('call_signals').insert({
        conversation_id: conversationId,
        caller_id: user?.id,
        callee_id: remoteUserId,
        type: 'call-ended',
        signal_data: {},
      });
    }

    // Cleanup
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

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
      .channel(`call:${conversationId}:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `callee_id=eq.${user.id}`,
        },
        async (payload) => {
          const signal = payload.new as CallSignal;
          if (signal.conversation_id !== conversationId) return;
          console.log('Received signal:', signal.type, signal);

          switch (signal.type) {
            case 'call-accepted':
              setCallStatus('connected');
              // Người gọi tạo offer sau khi được chấp nhận
              const pc = createPeerConnection(signal.caller_id);
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              
              await supabase.from('call_signals').insert({
                conversation_id: conversationId,
                caller_id: user.id,
                callee_id: signal.caller_id,
                type: 'offer',
                signal_data: offer,
              });
              break;

            case 'call-rejected':
              setCallStatus('ended');
              alert('Cuộc gọi bị từ chối');
              setTimeout(() => onHide(), 1000);
              break;

            case 'call-ended':
              endCall();
              break;

            case 'offer':
              if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(
                  new RTCSessionDescription(signal.signal_data)
                );
                const answer = await peerConnectionRef.current.createAnswer();
                await peerConnectionRef.current.setLocalDescription(answer);
                
                await supabase.from('call_signals').insert({
                  conversation_id: conversationId,
                  caller_id: user.id,
                  callee_id: signal.caller_id,
                  type: 'answer',
                  signal_data: answer,
                });
              }
              break;

            case 'answer':
              if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(
                  new RTCSessionDescription(signal.signal_data)
                );
              }
              break;

            case 'ice-candidate':
              if (peerConnectionRef.current) {
                await peerConnectionRef.current.addIceCandidate(
                  new RTCIceCandidate(signal.signal_data)
                );
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
  }, [show, conversationId, user?.id]);

  // Auto start call if outgoing
  useEffect(() => {
    if (show && !isIncoming && callStatus === 'idle') {
      startCall();
    }
    if (show && isIncoming) {
      setCallStatus('ringing');
    }
  }, [show, isIncoming]);

  // Cleanup on close
  useEffect(() => {
    if (!show) {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      setCallStatus('idle');
    }
  }, [show]);

  return (
    <Modal show={show} onHide={endCall} centered size="lg" backdrop="static">
      <Modal.Header className="bg-dark text-white">
        <Modal.Title>
          {callStatus === 'ringing' && `📞 ${callerName || 'Ai đó'} đang gọi...`}
          {callStatus === 'calling' && `📞 Đang gọi ${conversationName}...`}
          {callStatus === 'connected' && `🟢 Đang gọi với ${conversationName}`}
          {callStatus === 'ended' && '📵 Cuộc gọi kết thúc'}
          {callStatus === 'idle' && '📞 Video Call'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-dark p-0">
        <div className="position-relative" style={{ height: '400px' }}>
          {/* Remote video (full size) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-100 h-100 bg-secondary"
            style={{ objectFit: 'cover' }}
          />
          
          {/* Local video (picture-in-picture) */}
          <div
            className="position-absolute bg-dark rounded overflow-hidden"
            style={{ bottom: '1rem', right: '1rem', width: '150px', height: '100px' }}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-100 h-100"
              style={{ objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
          </div>

          {/* Call status overlay */}
          {callStatus !== 'connected' && (
            <div
              className="position-absolute top-50 start-50 translate-middle text-center text-white"
            >
              {callStatus === 'calling' && (
                <>
                  <Spinner animation="grow" variant="light" className="mb-3" />
                  <h4>Đang gọi...</h4>
                  <p className="text-muted">Đang chờ phản hồi</p>
                </>
              )}
              {callStatus === 'ringing' && (
                <>
                  <div className="display-1 mb-3">📞</div>
                  <h4>{callerName || 'Ai đó'} đang gọi cho bạn</h4>
                </>
              )}
              {callStatus === 'ended' && (
                <>
                  <div className="display-1 mb-3">📵</div>
                  <h4>Cuộc gọi đã kết thúc</h4>
                </>
              )}
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer className="bg-dark border-0 justify-content-center">
        {callStatus === 'ringing' ? (
          <>
            <Button variant="success" size="lg" onClick={acceptCall} className="rounded-circle p-3 me-3">
              📞
            </Button>
            <Button variant="danger" size="lg" onClick={rejectCall} className="rounded-circle p-3">
              ❌
            </Button>
          </>
        ) : (
          <>
            <Button
              variant={isVideoEnabled ? 'light' : 'secondary'}
              onClick={toggleVideo}
              className="rounded-circle p-3 me-2"
              disabled={callStatus !== 'connected'}
            >
              {isVideoEnabled ? '📹' : '🚫'}
            </Button>
            <Button
              variant={isAudioEnabled ? 'light' : 'secondary'}
              onClick={toggleAudio}
              className="rounded-circle p-3 me-2"
              disabled={callStatus !== 'connected'}
            >
              {isAudioEnabled ? '🎤' : '🔇'}
            </Button>
            <Button variant="danger" onClick={endCall} className="rounded-circle p-3">
              📵
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default VideoCall;
